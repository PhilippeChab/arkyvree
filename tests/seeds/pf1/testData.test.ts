import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { CHARACTERS } from "@/content/pf1/testData/characters.ts";
import type { TestCharacterSeed } from "@/content/pf1/testData/types.ts";
import { createCharacter, seedCharacter } from "@/database/seeders/pf1/characters/seedCharacter.ts";
import { getSeedContext, type SeedContext } from "@/database/seeders/pf1/characters/seedContext.ts";
import { seedTestCharacters } from "@/database/seeders/pf1/characters/seedTestCharacters.ts";
import { charactersInCharacter } from "@/drizzle/schema.ts";
import type { KlassLevel } from "@/engine/rulesets/pf1/index.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import {
  CharacterAdvancements,
  CharacterInventory,
  CharacterLinks,
  Characters,
  Entities,
  Visibility,
} from "@/server/repositories/index.ts";
import type { Character } from "@/shared/relations.ts";
import { buildCharacter } from "@/tests/support/pf1/characters.ts";
import { findPicks } from "@/tests/support/pf1/levels.ts";
import { PF1_BASE_RULES } from "@/vocabulary/pf1/baseRules.ts";

/** A seeded character's sheet, as the tests check it: its hit points, base attack, saves, AC and a skill's total. */
interface Sheet {
  /** Its first weapon set's armor class: null where the engine doesn't model a part of it yet (`SHEETS`). */
  ac: number | null;
  bab: number;
  hp: number;
  saves: [number, number, number];
  skill: [string, number];
}

/**
 * Each seeded character's sheet, worked out by the Core Rulebook's rules from its seed (race, 15-point buy, levels,
 * feats, gear):
 * - Corwin: AC 10 + breastplate 6 + heavy shield 2 + Dex 1 + Dodge 1; Intimidate 5 ranks + 3 + Cha -1.
 * - Ithriel: AC 10 + Dex 2; Spellcraft 5 + 3 + Int 4.
 * - Durgan: hp 19 + Con 2 × 3 + Toughness 3; AC 10 + chainmail 6 + heavy shield 2 + Dex 1 (chainmail's cap 2).
 * - Wren: Ref 4 + Dex 4 + halfling 1; AC 10 + leather 2 + Dex 4 + Dodge 1 + Small 1; Stealth 4 + 3 + Dex 4 + Small 4.
 * - Mogra: Fort 3 + 2 + Con 2; Intimidate 2 + 3 + Cha -1 + half-orc 2.
 * - Fizzwick: AC 10 + Dex 2 + Small 1; Bluff 4 + 3 + Cha 4.
 * - Sorrel: AC 10 + studded leather 3 + Dex 4; Perception 6 + 3 + Wis 1 + half-elf 2.
 * - Seraphine: saves with Divine Grace's Cha 2; AC 10 + full plate 9 + heavy shield 2.
 * - Lucan: hp 52 + Con 1 × 7 + Toughness 7; Ref 2 + duelist 1 + Dex 4; Acrobatics 7 + 3 (a duelist's class skill) + Dex
 *   4 - studded leather 1. His AC isn't checked: the duelist's Canny Defense (his Intelligence to it) has no modifier.
 */
const SHEETS: Record<string, Sheet> = {
  "Corwin Ashvale": { hp: 55, bab: 5, saves: [6, 2, 2], ac: 20, skill: ["intimidate", 7] },
  "Ithriel Moonquill": { hp: 27, bab: 2, saves: [2, 3, 4], ac: 12, skill: ["spellcraft", 12] },
  "Durgan Stonehearth": { hp: 28, bab: 2, saves: [5, 2, 6], ac: 19, skill: ["heal", 9] },
  "Wren Underbough": { hp: 27, bab: 3, saves: [3, 9, 2], ac: 18, skill: ["stealth", 15] },
  "Mogra Tuskbreaker": { hp: 34, bab: 3, saves: [7, 1, 0], ac: 15, skill: ["intimidate", 6] },
  "Fizzwick Pebblebright": { hp: 26, bab: 2, saves: [3, 3, 4], ac: 13, skill: ["bluff", 11] },
  "Sorrel Brightwater": { hp: 54, bab: 6, saves: [6, 9, 3], ac: 17, skill: ["perception", 12] },
  "Seraphine Valcourt": { hp: 37, bab: 4, saves: [7, 3, 6], ac: 21, skill: ["diplomacy", 9] },
  "Lucan Verrault": { hp: 66, bab: 7, saves: [6, 7, 3], ac: null, skill: ["acrobatics", 13] },
};

function inventoryLine(item: { groups?: number[]; location?: string | null; name: string; quantity: number }) {
  return `${item.name} x${item.quantity} in ${item.location ?? "—"} set ${item.groups?.join(", ") || "—"}`;
}

/** Names by id, of a map of ids by name. */
function namesOf(ids: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(ids).map(([name, id]) => [id, name]));
}

/**
 * What a character's seed says it has, on the ruleset characters are seeded on, as `written` reads it back: a level is
 * its class and level there.
 */
function seeded(
  {
    abilityIncreases = [],
    classes,
    skills,
    feats,
    spells = [],
    inventory,
    abilities,
    languages,
    ...identity
  }: TestCharacterSeed,
  rulesetId: string,
) {
  const levels = classes.flatMap(({ klass, hp }) => hp.map((_, i) => `${klass} ${i + 1}`));
  return {
    identity: {
      rulesetId,
      name: identity.name,
      race: identity.links.race,
      fields: { ...identity.fields },
      description: identity.description,
    },
    abilities,
    languages: [...languages].sort(),
    levels: classes.flatMap(({ klass, hp }) => hp.map((rolled, i) => `${klass} ${i + 1}: ${rolled} hp`)).sort(),
    abilityIncreases: abilityIncreases.map((a) => `${levels[a.levelIndex]}: ${a.abilityName} +1`).sort(),
    skills: skills.map((s) => `${levels[s.levelIndex]}: ${s.skillName} ${s.rank}`).sort(),
    feats: feats.map((f) => `${levels[f.levelIndex]}: ${f.featName} in ${f.aptitude}`).sort(),
    spells: spells.map((p) => `${levels[p.levelIndex]}: ${p.spellName} in ${p.aptitude}`).sort(),
    inventory: inventory.map(inventoryLine).sort(),
  };
}

/** The seed user's characters `seed` created: those it has now that it didn't have before. */
async function seedCreating(seed: () => Promise<void>) {
  const ownIds = async () =>
    (
      await db
        .select({ id: charactersInCharacter.id })
        .from(charactersInCharacter)
        .where(eq(charactersInCharacter.userId, SEED_USER_ID))
    ).map(({ id }) => id);
  const before = new Set(await ownIds());
  await seed();
  const created = (await ownIds()).filter((id) => !before.has(id));
  return await Characters.findMany(db, { ids: created }, Visibility.All);
}

/** A built character's sheet, as `SHEETS` lists it (`skill`: the skill it checks, by its slug). */
async function sheetOf(character: Character, skill: string): Promise<Sheet> {
  const built = await buildCharacter(character.id);
  const combat = built.components.combat.getCombat();
  const saves = built.components.saves.getSaves();
  return {
    hp: combat.hp.total,
    bab: combat.bab,
    saves: [saves.fortitude.total, saves.reflex.total, saves.will.total],
    ac: SHEETS[character.name].ac === null ? null : combat.weaponsets["0"].ac.total,
    skill: [skill, built.components.skills.getSkills()[skill].total],
  };
}

/** What the seed wrote of a character, on the seeded core rules (`ctx`). */
async function written(ctx: SeedContext, character: Character) {
  const [races, classes, abilities, languages, skills, feats, aptitudes, spells, items] = [
    ctx.raceMap.pc,
    ctx.classMap.pc,
    ctx.abilityMap,
    ctx.langMap,
    ctx.skillMap,
    ctx.featMap,
    ctx.aptMap,
    ctx.spellMap,
    ctx.itemMap,
  ].map(namesOf);
  const levels = await CharacterAdvancements.findMany(db, { characterId: character.id });
  const levelNames: Record<string, string> = {};
  for (const level of levels) {
    const classLevel = (await Entities.findOne<KlassLevel>(db, { entityType: "class-levels", id: level.entryId }))!;
    levelNames[level.id] = `${classes[classLevel.ownerId]} ${classLevel.position}`;
  }
  const levelIds = levels.map(({ id }) => id);
  const links = await CharacterLinks.findPerRole(db, PF1_BASE_RULES, { characterId: character.id });
  return {
    identity: {
      rulesetId: character.rulesetId,
      name: character.name,
      race: races[character.links.race],
      fields: character.fields as Readonly<Record<string, unknown>>,
      description: character.description,
    },
    abilities: Object.fromEntries(links.score.map((ability) => [abilities[ability.entityId], ability.amount])),
    languages: links.speaks.map((language) => languages[language.entityId]).sort(),
    levels: (await findPicks("hp", levelIds)).map((hp) => `${levelNames[hp.advancementId]}: ${hp.amount} hp`).sort(),
    abilityIncreases: (await findPicks("abilities", levelIds))
      .map((a) => `${levelNames[a.advancementId]}: ${abilities[a.entityId!]} +${a.amount}`)
      .sort(),
    skills: (await findPicks("skills", levelIds))
      .map((s) => `${levelNames[s.advancementId]}: ${skills[s.entityId!]} ${s.amount}`)
      .sort(),
    feats: (await findPicks("feats", levelIds))
      .map((f) => `${levelNames[f.advancementId]}: ${feats[f.entityId!]} in ${aptitudes[f.viaId!]}`)
      .sort(),
    spells: (await findPicks("spells", levelIds))
      .map((p) => `${levelNames[p.advancementId]}: ${spells[p.entityId!]} in ${aptitudes[p.viaId!]}`)
      .sort(),
    inventory: (await CharacterInventory.findMany(db, { characterId: character.id }))
      .map((item) => inventoryLine({ ...item, name: items[item.itemId] }))
      .sort(),
  };
}

describe("The Pathfinder test data", () => {
  test("seeds the seed user's characters as written, each valid, with the creatures their levels bond them to", async () => {
    const ctx = await getSeedContext(db);
    const created = await seedCreating(() => seedTestCharacters(db));

    const masters = created.filter((character) => character.kind === "pc");
    expect(masters.map(({ name }) => name).sort()).toEqual(CHARACTERS.map(({ name }) => name).sort());
    for (const seed of CHARACTERS) {
      const character = masters.find(({ name }) => name === seed.name)!;
      expect(await written(ctx, character)).toEqual(seeded(seed, ctx.rulesetId));
      const built = await buildCharacter(character.id);
      expect({ name: seed.name, validation: built.validate() }).toEqual({
        name: seed.name,
        validation: { valid: true, issues: [] },
      });
    }

    const bonded = created
      .filter((character) => character.kind !== "pc")
      .map(
        (creature) =>
          `${masters.find(({ id }) => id === creature.parentCharacterId)?.name}: ${creature.kind} ${creature.name}`,
      );
    expect(bonded.sort()).toEqual(["Ithriel Moonquill: familiar Raven", "Sorrel Brightwater: animalcompanion Wolf"]);
  }, 60_000);

  test("seeds each character's sheet as the Core Rulebook works it out", async () => {
    const created = await seedCreating(() => seedTestCharacters(db));
    const masters = created.filter((character) => character.kind === "pc");
    const sheets: Record<string, Sheet> = {};
    for (const character of masters) sheets[character.name] = await sheetOf(character, SHEETS[character.name].skill[0]);
    expect(sheets).toEqual(SHEETS);
  }, 60_000);

  test("refuses a level its rules refuse, naming the character and the level", async () => {
    const ctx = await getSeedContext(db);
    const [seed] = CHARACTERS;
    // A duelist's first level asks for a base attack bonus of +6, Dodge, Mobility, Weapon Finesse and skill ranks
    const refused = { ...seed, classes: [{ klass: "Duelist", hp: [10] }], skills: [], feats: [], inventory: [] };
    expect(seedCharacter(db, ctx, refused)).rejects.toThrow(
      new RegExp(`^${seed.name}, level 1 \\(Duelist\\): .*Unmet prerequisite on Duelist Level 1`),
    );
  });

  test("refuses a character's seed naming a race the ruleset doesn't seed", async () => {
    const ctx = await getSeedContext(db);
    const [{ name, description, fields }] = CHARACTERS;
    expect(
      createCharacter(db, ctx, {
        name,
        description,
        fields,
        abilities: {},
        languages: [],
        links: { race: "Test Nothing" },
      }),
    ).rejects.toThrow(`${name}'s race: "Test Nothing" isn't seeded`);
  });
});
