import { eq, type InferInsertModel, or } from "drizzle-orm";
import type { InferRequestType } from "hono/client";

import type { Db } from "@/drizzle/database.ts";
import { charactersInCharacter } from "@/drizzle/schema.ts";
import Modules from "@/engine/api/Modules.ts";
import { CharacterInputs, CharacterProjection } from "@/engine/core/module/index.ts";
import { type RulesetScope, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import { CharactersService, readCharacterInput } from "@/server/services/characters/index.ts";
import type { Character, Session } from "@/shared/relations.ts";

import { api, expectOk } from "./api.ts";
import { getSeedCtx, uniqueId } from "./seed.ts";

/**
 * Moves a character's last change, and its bonded creatures', back to `at`, long before any test, writing it alone
 * (the database keeps what such a write sets): a test's writes all run at its transaction's start, so a change the test
 * makes then moves the character past `at`.
 */
export async function backdateLastChange(characterId: string, at = "2000-01-01T00:00:00Z") {
  await db
    .update(charactersInCharacter)
    .set({ lastChangedAt: at })
    .where(or(eq(charactersInCharacter.id, characterId), eq(charactersInCharacter.parentCharacterId, characterId)));
}

/**
 * `record`, built the way the engine builds a character (its base rules' module, `Modules.of`: of its row's kind, a
 * bonded creature's master built first): its rows read through `database`, in `scope` when it's the character's
 * ruleset's, with what a level-up adds when the test projects some (`project`).
 */
export async function buildCharacter(
  record: Character,
  {
    database = db,
    project,
    scope,
  }: { database?: Db; project?: (projection: CharacterProjection) => void; scope?: RulesetScope } = {},
) {
  const build = async (view: RulesetScope) => {
    // As the engine's character handle reads them: its rows' references resolved through the view
    const read = CharacterInputs.resolve(await readCharacterInput(database, record), view.rulesetData.cow);
    // With what a level-up adds, when the test projects some
    const projection = new CharacterProjection(read);
    project?.(projection);
    return Modules.of(view.ruleset.baseRules).levelUp.buildCharacter(view, projection.input);
  };
  if (scope?.ruleset.id !== record.rulesetId) return await withRulesetScope(database, record.rulesetId, build);
  return await build(scope);
}

/**
 * A new character of `session`'s, created through the service: a Human on the seeded ruleset, unless `values` says
 * otherwise.
 */
export async function createCharacterAs(
  session: Session,
  values: Partial<Parameters<typeof CharactersService.createCharacter>[1]> = {},
) {
  const { rulesetId, raceMap } = await getSeedCtx();
  return await CharactersService.createCharacter(session, {
    rulesetId,
    raceId: raceMap.pc["Human"],
    name: `Test Character ${uniqueId()}`,
    xp: 0,
    alignment: "True Neutral",
    abilities: {},
    age: 25,
    gender: "Male",
    height: "180",
    weight: "80",
    ...values,
  });
}

/**
 * A human character of `userId`'s on the seeded ruleset, written straight to
 * the database: no abilities, levels or activity. Create one with
 * `createCharacterAs` when the test needs those.
 */
export async function createTestCharacter(
  userId: string,
  values: Partial<InferInsertModel<typeof charactersInCharacter>> = {},
) {
  const ctx = await getSeedCtx();
  const [character] = await Characters.create(db, {
    userId,
    rulesetId: ctx.rulesetId,
    raceId: ctx.raceMap.pc["Human"],
    name: `Test Character ${uniqueId()}`,
    xp: 0,
    alignment: "Neutral Good",
    age: 25,
    gender: "Male",
    height: "180",
    weight: "75",
    ...values,
  });
  return character;
}

/**
 * A new character of the seed user's, created through the API: a Human on the seeded ruleset with every ability at 10,
 * unless `json` says otherwise.
 */
export async function postCharacter(json: Partial<InferRequestType<typeof api.api.characters.$post>["json"]> = {}) {
  const ctx = await getSeedCtx();
  const { rulesetId = ctx.rulesetId, name = `Test Character ${uniqueId()}`, ...rest } = json;
  return await expectOk(
    api.api.characters.$post({
      json: {
        raceId: ctx.raceMap.pc["Human"],
        xp: 0,
        alignment: "True Neutral",
        abilities: Object.fromEntries(Object.values(ctx.abilityMap).map((id) => [id, 10])),
        age: 25,
        gender: "Male",
        height: "180",
        weight: "80",
        ...rest,
        rulesetId,
        name,
      },
    }),
  );
}
