/**
 * Seeds a character: its row, its levels with their skills, feats and spells, each saved as a level-up saves it, its
 * inventory, and its bonded creatures.
 */

import type { InventorySeed } from "@/content/pf1/builders/characters/types.ts";
import type { TestCharacterSeed } from "@/content/pf1/testData/types.ts";
import type { Db } from "@/drizzle/database.ts";
import { type AdvancementPlanRequest, Engine } from "@/engine/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { withRulesetScope } from "@/server/cow/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { CharacterInventory, Characters } from "@/server/repositories/index.ts";
import { createAdvancement, writeChildren } from "@/server/services/characters/advancements/index.ts";
import { createNewCharacter, readCharacterInput, readChildInputs } from "@/server/services/characters/index.ts";
import { PF1_BASE_RULES } from "@/vocabulary/pf1/baseRules.ts";

import { type SeedContext } from "./seedContext.ts";

/** A seeded character's level: its class and hit points, and its picks there (`levelIndex` its place among them). */
interface SeededLevel {
  hp: number;
  klass: string;
  levelIndex: number;
}

/** What an ability increase raises its ability by: a point. */
const ABILITY_INCREASE = 1;

/** The id of an entity a character's seed names (`name`, of `ids`), or an error that says which (`what`). */
function idOf(ids: Record<string, string>, name: string, what: string): string {
  const id = ids[name];
  if (!id) throw new Error(`${what}: "${name}" isn't seeded`);
  return id;
}

/** A seed's levels, in the order it takes them: each class's, from its first. */
function levelsOf({ classes }: TestCharacterSeed): SeededLevel[] {
  return classes
    .flatMap(({ hp, klass }) => hp.map((rolled) => ({ hp: rolled, klass })))
    .map((level, levelIndex) => ({ ...level, levelIndex }));
}

/**
 * A seeded level as the Add Level wizard sends its plan: its class, its hit points, its ability increase, and the
 * skill points, feats and spells the seed picks at it, each by its id, a feat or a spell in its pool.
 */
function planOf(ctx: SeedContext, seed: TestCharacterSeed, { hp, klass, levelIndex }: SeededLevel) {
  const at = <T extends { levelIndex: number }>(picks: T[] = []) => picks.filter((p) => p.levelIndex === levelIndex);
  const what = (kind: string) => `${seed.name}'s ${kind}`;
  return {
    steps: {
      "class-plan": [{ track: idOf(ctx.classMap.pc, klass, what("class")) }],
      hp: [hp],
      abilities: [
        at(seed.abilityIncreases).map(({ abilityName }) => ({
          amount: ABILITY_INCREASE,
          id: idOf(ctx.abilityMap, abilityName, what("ability increase")),
        })),
      ],
      skills: at(seed.skills).map(({ rank, skillName }) => ({
        id: idOf(ctx.skillMap, skillName, what("skill")),
        points: rank,
      })),
      feats: at(seed.feats).map(({ aptitude, featName }) => ({
        id: idOf(ctx.featMap, featName, what("feat")),
        pool: idOf(ctx.aptMap, aptitude, what("feat's aptitude")),
      })),
      spells: at(seed.spells).map(({ aptitude, spellName }) => ({
        id: idOf(ctx.spellMap, spellName, what("spell")),
        pool: idOf(ctx.aptMap, aptitude, what("spell's aptitude")),
      })),
    },
  } satisfies AdvancementPlanRequest;
}

/**
 * Writes a seeded character's inventory as an entry's add plans it (where each item is held, and how many, as many as
 * its place has room for), one at a time: each checked against those before it, as the inventory dialog's add is.
 */
async function addInventory(db: Db, ctx: SeedContext, characterId: string, items: InventorySeed[]) {
  if (items.length === 0) return;
  const record = await Characters.findOne(db, { id: characterId });
  if (!record) throw new NotFoundError(`Character ${characterId} not found`);
  let character = await readCharacterInput(db, record);
  await withRulesetScope(db, record.rulesetId, async (scope) => {
    for (const { groups = [], location = null, name, quantity } of items) {
      const itemId = idOf(ctx.itemMap, name, "An inventory's item");
      const request = { groups, location, quantity, remainingCharges: null, totalCharges: null };
      const plan = Engine.for(scope).character(character).planInventoryEntry({ itemId, request }, false);
      const [row] = await CharacterInventory.create(db, { ...plan, characterId });
      character = { ...character, rows: { ...character.rows, inventory: [...character.rows.inventory, row] } };
    }
  });
}

/**
 * Saves a level as the server saves a level-up (`request`): the engine plans it from the character's rows, checks it
 * and the character with it, unforced, and the save writes its advancement, its picks and what the character's bonded
 * creatures become with it. A refusal names the character and the level.
 */
async function addLevel(db: Db, characterId: string, request: AdvancementPlanRequest, label: string) {
  const record = await Characters.findOne(db, { id: characterId });
  if (!record) throw new NotFoundError(`Character ${characterId} not found`);
  await withRulesetScope(db, record.rulesetId, async (scope) => {
    const character = await readCharacterInput(db, record);
    const children = await readChildInputs(db, character);
    let plan;
    try {
      plan = Engine.for(scope).character(character).advancements().planAddition(children, request, false);
    } catch (error) {
      throw new Error(`${label}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    for (const advancement of plan.advancements) await createAdvancement(db, PF1_BASE_RULES, characterId, advancement);
    await writeChildren(db, PF1_BASE_RULES, plan.children);
  });
}

/**
 * Writes a seeded character's row and links: it starts as a new character does, as the engine plans it (its kind, its
 * race and its ability scores), with its languages and its fields as stored.
 */
export async function createCharacter(
  db: Db,
  ctx: SeedContext,
  data: Pick<TestCharacterSeed, "abilities" | "description" | "fields" | "languages" | "links" | "name">,
) {
  const start = {
    picks: { race: idOf(ctx.raceMap.pc, data.links.race, `${data.name}'s race`) },
    scores: {
      score: Object.fromEntries(
        Object.entries(data.abilities).map(([name, amount]) => [
          idOf(ctx.abilityMap, name, `${data.name}'s ability`),
          amount,
        ]),
      ),
    },
  };
  const { links, row } = await withRulesetScope(db, ctx.rulesetId, async (scope) =>
    Engine.for(scope).characters().planStart(start),
  );
  const character = await createNewCharacter(db, PF1_BASE_RULES, {
    links: {
      ...links,
      speaks: data.languages.map((language) => ({
        entityId: idOf(ctx.langMap, language, `${data.name}'s language`),
      })),
    },
    row: {
      ...row,
      userId: SEED_USER_ID,
      rulesetId: ctx.rulesetId,
      name: data.name,
      description: data.description,
      fields: { ...data.fields },
    },
  });

  return character.id;
}

/**
 * Seeds a character: its row, then each of its levels saved in turn as a level-up saves it, unforced (so a level its
 * rules refuse fails the seed), with the creatures its levels bond it to, then its inventory.
 */
export async function seedCharacter(db: Db, ctx: SeedContext, seed: TestCharacterSeed) {
  const characterId = await createCharacter(db, ctx, seed);
  for (const level of levelsOf(seed)) {
    const label = `${seed.name}, level ${level.levelIndex + 1} (${level.klass})`;
    await addLevel(db, characterId, planOf(ctx, seed, level), label);
  }
  await addInventory(db, ctx, characterId, seed.inventory);
}
