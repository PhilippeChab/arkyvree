/**
 * Seeds a character: its row, its classes' levels with their skills, feats and spells, its inventory, and its bonded
 * creatures.
 */

import type { CharacterSeed, InventorySeed } from "@/content/dnd3.5/builders/characters/types.ts";
import type { Db } from "@/drizzle/database.ts";
import { Engine } from "@/engine/index.ts";
import type { KlassLevel } from "@/engine/rulesets/dnd3.5/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { CharacterInventory, CharacterLinks, Characters, Entities, Picks } from "@/server/repositories/index.ts";
import { readCharacterInput, readChildInputs } from "@/server/services/characters/index.ts";
import { createAdvancement, writeChildren } from "@/server/services/characters/levels/index.ts";

import { type SeedContext } from "./seedContext.ts";

async function addInventory(db: Db, ctx: SeedContext, characterId: string, items: InventorySeed[]) {
  if (items.length === 0) return;
  await CharacterInventory.createMany(
    db,
    items.map((item) => ({
      characterId,
      itemId: ctx.itemMap[item.name],
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
  const klassId = ctx.klassMap.pc[className];
  const levelIds: string[] = [];

  const klassLevels = await Entities.findMany<KlassLevel>(db, { entityType: "class_levels", ownerIds: [klassId] });
  for (let i = 0; i < levels.length; i++) {
    const klassLevel = klassLevels.find((row) => row.level === levels[i])!;
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
      entityId: ctx.featMap[f.featName],
      viaId: ctx.aptMap[f.aptitude],
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
      entityId: ctx.skillMap[s.skillName],
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
      entityId: ctx.spellMap[p.spellName],
      viaId: ctx.aptMap[p.aptitude],
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
    userId: SEED_USER_ID,
    rulesetId: data.rulesetId ?? ctx.rulesetId,
    raceId: ctx.raceMap.pc[data.raceName],
    name: data.name,
    xp: data.xp,
    alignment: data.alignment,
    age: data.age,
    gender: data.gender,
    height: data.height,
    weight: data.weight,
    description: data.description,
  });

  await CharacterLinks.createMany(
    db,
    "abilities",
    Object.entries(data.abilities).map(([name, score]) => ({
      characterId: character.id,
      abilityId: ctx.abilityMap[name],
      score,
    })),
  );
  await CharacterLinks.createMany(
    db,
    "languages",
    data.languages.map((lang) => ({ characterId: character.id, languageId: ctx.langMap[lang] })),
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
