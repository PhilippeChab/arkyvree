/**
 * Seeded D&D 3.5 characters and the level picks the level-up tests share: who the character is, what each class level
 * spends its points on, and the masters whose picks bond them a familiar, a companion or a mount.
 */

import { createCharacter } from "@/database/seeds/seedCharacter.ts";
import { type SeedContext } from "@/database/seeds/seedContext.ts";
import { db } from "@/server/database/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import type { Session } from "@/shared/relations.ts";

import { addOneLevel } from "./levels.ts";
import { getSeedCtx, uniqueId } from "./seed.ts";
import { makeSession } from "./users.ts";

type CharacterValues = Omit<Parameters<typeof createCharacter>[2], "name" | "xp" | "description">;

/** A level's picks by name, with its hit points and ability increase. */
export type LevelPlan = {
  ability?: string;
  feats?: Record<string, string[]>;
  hp: number;
  powers?: Record<string, string[]>;
  skills?: Record<string, number>;
};

/** A level's picks, by id: skill ranks, and feats and powers by the aptitude they're picked through. */
export type Picks = {
  feats: Record<string, string[]>;
  powers: Record<string, string[]>;
  skills: Record<string, number>;
};

/** A human druid's first level, with a wolf for animal companion. */
const DRUID_1: LevelPlan = {
  hp: 8,
  skills: { Concentration: 4, "Knowledge (Nature)": 4, Survival: 4, Spellcraft: 4, "Handle Animal": 4 },
  feats: { General: ["Toughness", "Combat Casting"], "Animal Companion Bond": ["Wolf Animal Companion"] },
};

/** A human paladin's first level. */
const PALADIN_1: LevelPlan = {
  hp: 10,
  skills: { Diplomacy: 4, "Knowledge (Religion)": 4, Ride: 4, "Sense Motive": 4 },
  feats: { General: ["Toughness", "Power Attack"] },
};

/** The character builds the tests level up. */
export const BUILDS = {
  /** Human, INT 12: (2 + 1 + 1) skill points a fighter level, ×4 at the first. */
  fighter: {
    raceName: "Human",
    alignment: "Neutral Good",
    age: 25,
    gender: "Male",
    height: "180",
    weight: "80",
    languages: ["Common"],
    abilities: { Strength: 16, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 8 },
  },
  sorcerer: {
    raceName: "Human",
    alignment: "Chaotic Good",
    age: 25,
    gender: "Male",
    height: "170",
    weight: "70",
    languages: ["Common"],
    abilities: { Strength: 8, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 16 },
  },
  /** Elf, INT 18: (2 + 4) skill points a wizard level, ×4 at the first. */
  wizard: {
    raceName: "Elf",
    alignment: "Neutral Good",
    age: 130,
    gender: "Female",
    height: "170",
    weight: "48",
    languages: ["Common", "Elven"],
    abilities: { Strength: 8, Dexterity: 14, Constitution: 12, Intelligence: 18, Wisdom: 12, Charisma: 10 },
  },
  cleric: {
    raceName: "Human",
    alignment: "Neutral Good",
    age: 30,
    gender: "Male",
    height: "180",
    weight: "80",
    languages: ["Common"],
    abilities: { Strength: 14, Dexterity: 10, Constitution: 14, Intelligence: 12, Wisdom: 16, Charisma: 12 },
  },
  druid: {
    raceName: "Human",
    alignment: "True Neutral",
    age: 30,
    gender: "Female",
    height: "170",
    weight: "65",
    languages: ["Common", "Druidic"],
    abilities: { Strength: 12, Dexterity: 12, Constitution: 14, Intelligence: 10, Wisdom: 16, Charisma: 10 },
  },
  paladin: {
    raceName: "Human",
    alignment: "Lawful Good",
    age: 30,
    gender: "Male",
    height: "180",
    weight: "80",
    languages: ["Common"],
    abilities: { Strength: 16, Dexterity: 10, Constitution: 14, Intelligence: 10, Wisdom: 12, Charisma: 14 },
  },
  /** A dwarf barbarian/fighter, INT 10. */
  dwarf: {
    raceName: "Dwarf",
    alignment: "Neutral Good",
    age: 60,
    gender: "Male",
    height: "140",
    weight: "85",
    languages: ["Common", "Dwarven"],
    abilities: { Strength: 16, Dexterity: 13, Constitution: 16, Intelligence: 10, Wisdom: 12, Charisma: 8 },
  },
} satisfies Record<string, CharacterValues>;

/** A human fighter's first four levels: 2 General feats and a bonus feat at the first, a strength increase at the fourth. */
export const FIGHTER_LEVELS: LevelPlan[] = [
  {
    hp: 10,
    skills: { Climb: 4, Intimidate: 4, Jump: 4, Swim: 4 },
    feats: { General: ["Power Attack", "Great Fortitude"], "Fighter Bonus Feat": ["Improved Initiative"] },
  },
  {
    hp: 8,
    skills: { Swim: 1, Climb: 1, Intimidate: 1, "Handle Animal": 1 },
    feats: { "Fighter Bonus Feat": ["Dodge"] },
  },
  { hp: 8, skills: { Jump: 1, Swim: 1, "Handle Animal": 1, Spot: 1 }, feats: { General: ["Toughness"] } },
  {
    hp: 8,
    ability: "Strength",
    skills: { Climb: 1, Swim: 1, "Handle Animal": 1, Spot: 1 },
    feats: { "Fighter Bonus Feat": ["Combat Reflexes"] },
  },
];

/** A human sorcerer's first level: a cat familiar, four cantrips and two first-level spells. */
export const SORCERER_1: LevelPlan = {
  hp: 4,
  skills: { Bluff: 4, Concentration: 4, Spellcraft: 4, "Use Magic Device": 4 },
  feats: { General: ["Toughness", "Great Fortitude"], "Familiar Bond": ["Cat Familiar"] },
  powers: { "Sorcerer Spells": ["Detect Magic", "Light", "Read Magic", "Mage Hand", "Magic Missile", "Shield"] },
};

/** A first cleric level taken as a second character level: the War and Good domains, and the longsword as war weapon. */
export const WAR_CLERIC_1: LevelPlan = {
  hp: 8,
  skills: { Concentration: 1, Heal: 1, Spellcraft: 1, Diplomacy: 1 },
  feats: { "Cleric Domain": ["War Domain", "Good Domain"], "War Domain Weapon": ["War Domain Weapon: Longsword"] },
};

/** An elf wizard's first level: an evoker who gave up illusion and necromancy. */
export const WIZARD_1: LevelPlan = {
  hp: 4,
  skills: {
    Spellcraft: 4,
    Concentration: 4,
    "Knowledge (Arcana)": 4,
    "Knowledge (Religion)": 4,
    "Knowledge (The Planes)": 4,
    "Decipher Script": 4,
  },
  feats: {
    General: ["Combat Casting"],
    "Wizard Specialization": ["Evocation Specialist"],
    "Prohibited School": ["Prohibit Illusion", "Prohibit Necromancy"],
    "Familiar Bond": ["Cat Familiar"],
  },
  powers: {
    "Wizard Spells": [
      "Detect Magic",
      "Light",
      "Read Magic",
      "Mage Hand",
      "Prestidigitation",
      "Resistance",
      "Magic Missile",
      "Mage Armor",
      "Shield",
    ],
  },
};

/** A seed-user character of `build` with `levels` of `klass`, and the creature of `kind` bonded to them. */
async function createMaster(
  kind: "familiar" | "animalcompanion" | "mount",
  build: keyof typeof BUILDS,
  klass: string,
  levels: number,
  first: LevelPlan,
  at: Record<number, Omit<LevelPlan, "hp">> = {},
) {
  const ctx = await getSeedCtx();
  const masterId = await createSeedCharacter(ctx, build);
  await levelTo(makeSession(), ctx, masterId, klass, levels, first, at);
  const bonded = await Characters.findOne(db, { parentCharacterId: masterId, kind });
  if (!bonded) throw new Error(`No ${kind} was bonded to the ${build}`);
  return { ctx, masterId, bonded };
}

/**
 * Finalizes levels 1 to `to` of `klass`: the first as `first` says, the others with its hit points, a Strength increase
 * every fourth, and the picks `at` gives them. Those levels are forced: the points they leave unspent don't matter here.
 */
async function levelTo(
  session: Session,
  ctx: SeedContext,
  characterId: string,
  klass: string,
  to: number,
  first: LevelPlan,
  at: Record<number, Omit<LevelPlan, "hp">> = {},
) {
  for (let level = 1; level <= to; level++) {
    const plan =
      level === 1 ? first : { hp: first.hp, ability: level % 4 === 0 ? "Strength" : undefined, ...at[level] };
    await levelUp(session, ctx, characterId, klass, level, plan, level > 1);
  }
}

/** A druid with this animal companion. */
export function createDruidWithCompanion(levels = 1, companion = "Wolf Animal Companion") {
  return createMaster(
    "animalcompanion",
    "druid",
    "Druid",
    levels,
    picking(DRUID_1, "Animal Companion Bond", [companion]),
  );
}

/** A paladin with this special mount, picked at the fifth level, which unlocks it. */
export function createPaladinWithMount(levels = 5, mount = "Heavy Warhorse Special Mount") {
  return createMaster("mount", "paladin", "Paladin", levels, PALADIN_1, {
    5: { feats: { "Special Mount Bond": [mount] } },
  });
}

/** A wizard whose first level, `plan`, picks this familiar. */
export function createWizardWithFamiliar(familiar = "Cat Familiar", plan = WIZARD_1) {
  return createMaster("familiar", "wizard", "Wizard", 1, picking(plan, "Familiar Bond", [familiar]));
}

/** Finalizes one level of `klass` as `plan` says. */
export function levelUp(
  session: Session,
  ctx: SeedContext,
  characterId: string,
  klass: string,
  level: number,
  plan: LevelPlan,
  force = false,
) {
  const { skills, feats, powers } = picks(ctx, plan);
  return addOneLevel(
    session,
    characterId,
    ctx.klassMap.pc[klass],
    level,
    plan.hp,
    plan.ability ? ctx.abilityMap[plan.ability] : null,
    skills,
    feats,
    powers,
    force,
  );
}

/** `plan` with these picks through `aptitude` instead of its own, or none. */
export function picking(plan: LevelPlan, aptitude: string, feats: string[]): LevelPlan {
  const { [aptitude]: _, ...others } = plan.feats ?? {};
  return { ...plan, feats: feats.length > 0 ? { ...others, [aptitude]: feats } : others };
}

/** The ids of a plan's picks. */
export function picks(ctx: SeedContext, { skills = {}, feats = {}, powers = {} }: Omit<LevelPlan, "hp">): Picks {
  const byAptitude = (named: Record<string, string[]>, ids: Record<string, string>) =>
    Object.fromEntries(
      Object.entries(named).map(([aptitude, names]) => [ctx.aptMap[aptitude], names.map((name) => ids[name])]),
    );
  return {
    skills: Object.fromEntries(Object.entries(skills).map(([name, rank]) => [ctx.skillMap[name], rank])),
    feats: byAptitude(feats, ctx.featMap),
    powers: byAptitude(powers, ctx.powerMap),
  };
}

/** Finalizes the first `count` fighter levels. */
export async function addFighterLevels(session: Session, ctx: SeedContext, characterId: string, count: number) {
  for (const [index, plan] of FIGHTER_LEVELS.slice(0, count).entries())
    await levelUp(session, ctx, characterId, "Fighter", index + 1, plan);
}

/** A new character of the seeded user on the seeded ruleset (or `rulesetId`), built as `build` with these changes. */
export async function createSeedCharacter(
  ctx: SeedContext,
  build: keyof typeof BUILDS = "fighter",
  {
    xp = 0,
    abilities = {},
    ...values
  }: Partial<Omit<CharacterValues, "abilities">> & { abilities?: Record<string, number>; xp?: number } = {},
) {
  const base = BUILDS[build];
  return await createCharacter(db, ctx, {
    ...base,
    ...values,
    abilities: { ...base.abilities, ...abilities },
    name: `Test ${build} ${uniqueId()}`,
    xp,
    description: "Test",
  });
}
