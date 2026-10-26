/**
 * Seeds a character: its row, its classes' levels with their skills, feats and spells, its inventory, and its bonded
 * creatures.
 */

import type { CharacterSeed, InventorySeed } from "@/content/dnd3.5/builders/characters/types.ts";
import type { Db } from "@/drizzle/database.ts";
import { Engine } from "@/engine/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { CharacterInventory, CharacterLinks, Characters, Entities, Picks } from "@/server/repositories/index.ts";
import { readCharacterInput, readChildInputs } from "@/server/services/characters/index.ts";
import { createAdvancement, writeChildren } from "@/server/services/characters/levels/index.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd3.5/bondedKinds.ts";

import { type SeedContext } from "./seedContext.ts";

/** The id of an entity a character's seed names (`name`, of `ids`), or an error that says which (`what`). */
function idOf(ids: Record<string, string>, name: string, what: string): string {
  const id = ids[name];
  if (!id) throw new Error(`${what}: "${name}" isn't seeded`);
  return id;
}

async function addInventory(db: Db, ctx: SeedContext, characterId: string, items: InventorySeed[]) {
  if (items.length === 0) return;
  await CharacterInventory.createMany(
    db,
    items.map((item) => ({
      characterId,
      itemId: idOf(ctx.itemMap, item.name, "An inventory's item"),
      quantity: item.quantity,
      equipped: item.equipped ?? false,
      location: item.location,
      groups: item.groups,
    })),
  );
}

/**
 * Builds a seeded character's children (3.5's bonded creatures: a familiar, a companion, a mount) from its levels, as
 * leveling up does.
 */
async function reconcileChildren(tx: Db, characterId: string): Promise<void> {
  const parent = await Characters.findOne(tx, { id: characterId });
  if (!parent) throw new NotFoundError(`Character ${characterId} not found`);
  // A child has none of its own
  if (parent.parentCharacterId) return;

  await withRulesetScope(tx, parent.rulesetId, async (scope) => {
    const character = await readCharacterInput(tx, parent);
    const children = await readChildInputs(tx, character);
    await writeChildren(tx, parent, Engine.for(scope).character(character).levelUp().planChildren(children).children);
  });
}

export async function addClassLevels(
  db: Db,
  ctx: SeedContext,
  characterId: string,
  className: string,
  levels: number[],
  hpPerLevel: number[],
) {
  const klassId = idOf(ctx.klassMap.pc, className, "A character's class");
  const levelIds: string[] = [];

  const klassLevels = await Entities.findPositions(db, { entityType: "class_levels", ownerIds: [klassId] });
  for (let i = 0; i < levels.length; i++) {
    const klassLevel = klassLevels.find((owned) => owned.position === levels[i])!;
    const advancement = await createAdvancement(db, characterId, {
      trackId: klassLevel.id,
      picks: [{ step: "hp", amount: hpPerLevel[i] }],
    });
    levelIds.push(advancement.id);
  }

  return levelIds;
}

export async function addFeats(
  db: Db,
  ctx: SeedContext,
  charLevelIds: string[],
  feats: { aptitude: string; featName: string; levelIndex: number }[],
) {
  await Picks.createMany(
    db,
    feats.map((f) => ({
      advancementId: charLevelIds[f.levelIndex],
      step: "feats",
      entityId: idOf(ctx.featMap, f.featName, "A character's feat"),
      viaId: idOf(ctx.aptMap, f.aptitude, "A character's feat's aptitude"),
    })),
  );
}

export async function addSkills(
  db: Db,
  ctx: SeedContext,
  charLevelIds: string[],
  skills: { levelIndex: number; rank: number; skillName: string }[],
) {
  await Picks.createMany(
    db,
    skills.map((s) => ({
      advancementId: charLevelIds[s.levelIndex],
      step: "skills",
      entityId: idOf(ctx.skillMap, s.skillName, "A character's skill"),
      amount: s.rank,
    })),
  );
}

export async function addSpells(
  db: Db,
  ctx: SeedContext,
  charLevelIds: string[],
  spells: { aptitude: string; levelIndex: number; spellName: string }[],
) {
  await Picks.createMany(
    db,
    spells.map((p) => ({
      advancementId: charLevelIds[p.levelIndex],
      step: "spells",
      entityId: idOf(ctx.spellMap, p.spellName, "A character's spell"),
      viaId: idOf(ctx.aptMap, p.aptitude, "A character's spell's aptitude"),
    })),
  );
}

export async function createCharacter(
  db: Db,
  ctx: SeedContext,
  data: Omit<CharacterSeed, "classes" | "feats" | "inventory" | "spells" | "skills"> & {
    /** Override the ruleset (e.g., to place the character in a fork that subscribes to an extension). Defaults to seed. */
    rulesetId?: string;
  },
) {
  const [character] = await Characters.create(db, {
    kind: PLAYER_CHARACTER_KIND,
    userId: SEED_USER_ID,
    rulesetId: data.rulesetId ?? ctx.rulesetId,
    name: data.name,
    description: data.description,
    fields: { ...data.fields },
    links: { race: idOf(ctx.raceMap.pc, data.links.race, `${data.name}'s race`) },
  });

  await CharacterLinks.createMany(
    db,
    character.id,
    "score",
    Object.entries(data.abilities).map(([name, amount]) => ({
      entityId: idOf(ctx.abilityMap, name, `${data.name}'s ability`),
      amount,
    })),
  );
  await CharacterLinks.createMany(
    db,
    character.id,
    "speaks",
    data.languages.map((language) => ({ entityId: idOf(ctx.langMap, language, `${data.name}'s language`) })),
  );

  return character.id;
}

/** Seeds a character, and the creatures its feats bond it to. */
export async function seedCharacter(
  db: Db,
  ctx: SeedContext,
  { classes, skills, feats, spells = [], inventory, ...data }: CharacterSeed,
) {
  const characterId = await createCharacter(db, ctx, data);
  const levelIds: string[] = [];
  for (const { klass, hp } of classes) {
    levelIds.push(
      ...(await addClassLevels(
        db,
        ctx,
        characterId,
        klass,
        hp.map((_, i) => i + 1),
        hp,
      )),
    );
  }
  await addSkills(db, ctx, levelIds, skills);
  await addFeats(db, ctx, levelIds, feats);
  await addSpells(db, ctx, levelIds, spells);
  await addInventory(db, ctx, characterId, inventory);
  await reconcileChildren(db, characterId);
}
