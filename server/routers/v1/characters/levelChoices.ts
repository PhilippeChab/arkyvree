/**
 * A character's choices at its next level, read in one request: the classes it can take, and for a planned level, what
 * each of the level-up wizard's steps offers with the picks made so far, each pool's options read whole. Each read
 * builds the character again, which one engine operation for the whole answer would build once: they run one at a
 * time, so a request holds one connection at most, and the route is limited apart (`levelChoicesRateLimit`).
 */

import type { AbilityIncrease } from "@/engine/index.ts";
import { BadRequestError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { fetchEveryPage } from "@/server/repositories/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";
import type { Session } from "@/shared/relations.ts";

/** The level-up wizard's step answers, as its service gives them. */
type Step = Awaited<ReturnType<typeof CharacterLevelsService.getStep>>;

/** The planned level: its class, and the picks made at it so far (its ability increases, skill points, feats, spells). */
export interface LevelChoicesQuery {
  abilityIncreases?: AbilityIncrease[];
  classId?: string;
  featPicks?: { aptitudeId: string; featId: string }[];
  powerPicks?: { aptitudeId: string; powerId: string }[];
  skillPoints?: Record<string, number>;
}

/** How many options a page of a picker reads: a pool's options are read whole, a page at a time. */
const OPTIONS_PAGE_SIZE = 500;

/** A step's answer of the kind `isKind` tells: refused as the wizard's own would be when the ruleset answers another. */
function narrowStep<S extends Step>(step: Step, isKind: (step: Step) => step is S) {
  if (!isKind(step)) throw new NotFoundError(`Level step ${step.name} not found`);
  return step;
}

/** The feats a pool offers at the planned level that the character qualifies for. */
async function readFeatOptions(
  session: Session,
  characterId: string,
  level: LevelChoicesQuery & { classId: string; level: number },
  aptitudeId: string,
) {
  const options = await fetchEveryPage(
    (pagination) =>
      CharacterLevelsService.getAvailableFeats(session, characterId, { ...level, aptitudeId }, pagination),
    OPTIONS_PAGE_SIZE,
  );
  return options.filter((option) => option.eligible);
}

/** The feats step of the planned level, each pool with room left with the feats it offers that qualify. */
async function readFeatSlots(
  session: Session,
  characterId: string,
  level: LevelChoicesQuery & { classId: string; level: number },
) {
  const step = narrowStep(
    await CharacterLevelsService.getStep(session, characterId, "feats", level),
    (answer) => "featsToSelect" in answer,
  );
  const slots = [];
  for (const pool of Object.values(step.aptitudePools).filter(({ available }) => available > 0))
    slots.push({ options: await readFeatOptions(session, characterId, level, pool.id), pool });
  return { fitted: step.fitted, granted: step.autoGrantedFeats, slots };
}

/** The spells a pool offers at the planned level, of a spell level when its pool counts them by level. */
async function readPowerOptions(
  session: Session,
  characterId: string,
  level: LevelChoicesQuery & { classId: string; level: number },
  aptitudeId: string,
  powerLevel?: number,
) {
  const options = await fetchEveryPage(
    (pagination) =>
      CharacterLevelsService.getAvailablePowers(session, characterId, { ...level, aptitudeId, powerLevel }, pagination),
    OPTIONS_PAGE_SIZE,
  );
  return options.filter((option) => option.eligible);
}

/** The spells step of the planned level, each pool with room left with the spells it offers, by spell level. */
async function readSpellSlots(
  session: Session,
  characterId: string,
  level: LevelChoicesQuery & { classId: string; level: number },
) {
  const step = narrowStep(
    await CharacterLevelsService.getStep(session, characterId, "powers", level),
    (answer) => "powersToSelect" in answer,
  );
  // Each pool with room left, a leveled one's at each spell level with room left
  const rooms = Object.values(step.aptitudePools)
    .filter(({ available }) => available > 0)
    .flatMap((pool): { available: number; pool: typeof pool; powerLevel?: number }[] =>
      pool.leveled
        ? Object.entries(pool.levels ?? {})
            .filter(([, { available }]) => available > 0)
            .map(([spellLevel, { available }]) => ({ available, pool, powerLevel: Number(spellLevel) }))
        : [{ available: pool.available, pool, powerLevel: undefined }],
    );
  const slots = [];
  for (const room of rooms) {
    slots.push({
      ...room,
      options: await readPowerOptions(session, characterId, level, room.pool.id, room.powerLevel),
    });
  }
  return { fitted: step.fitted, granted: step.autoGrantedPowers, slots };
}

/**
 * The character's choices at its next level: the classes it can take, and, for a planned level of class `classId`,
 * what each step offers with the picks made so far. Refused, as the wizard refuses to plan it, when the class isn't one
 * the character has a next level of, when the character doesn't qualify for it, or when it has no level left to take;
 * and when it sends ability increases at a level that takes none, which the other steps would build the character with.
 */
export async function readLevelChoices(session: Session, characterId: string, query: LevelChoicesQuery) {
  const classes = await fetchEveryPage(
    (pagination) => CharacterLevelsService.getAvailableClasses(session, characterId, {}, pagination),
    OPTIONS_PAGE_SIZE,
  );
  if (!query.classId) return { classes, level: null };
  const klass = classes.find(({ id }) => id === query.classId);
  if (!klass) throw new NotFoundError("The character has no next level in this class");
  if (klass.levelsLeft <= 0) throw new UnprocessableEntityError("The character has no level left to take");
  if (!klass.eligible) throw new UnprocessableEntityError(`The character doesn't meet ${klass.name}'s requirements`);

  const level = { ...query, classId: klass.id, level: klass.nextLevel };
  const abilities = narrowStep(
    await CharacterLevelsService.getStep(session, characterId, "abilities", level),
    (answer) => "isAvailable" in answer,
  );
  if (!abilities.isAvailable && query.abilityIncreases?.length)
    throw new BadRequestError("This level takes no ability increase");
  const skills = narrowStep(
    await CharacterLevelsService.getStep(session, characterId, "skills", level),
    (answer) => "skillPointsToSpend" in answer,
  );
  const feats = await readFeatSlots(session, characterId, level);
  const spells = await readSpellSlots(session, characterId, level);
  return { classes, level: { abilities, class: klass, feats, skills, spells } };
}
