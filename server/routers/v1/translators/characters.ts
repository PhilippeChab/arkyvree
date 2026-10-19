/**
 * A character as v1 answers it: its sheet, each thing it has named (its feats "Power Attack", with their ids beside
 * them), without the parts only the app's screens read (every modifier and requirement, the database's timestamps, the
 * owner's private notes).
 */

import type { CharactersService } from "@/server/services/characters/index.ts";

/** An ability score of a character's. */
interface V1Ability {
  abbreviation: string;
  id: string;
  modifier: number;
  name: string;
  score: number;
}

/** A bonded creature of a character's (its familiar, its animal companion, its mount): its sheet, and its kind. */
interface V1BondedCreature extends V1Sheet {
  bond: string;
}

/** A class a character has levels in. */
interface V1CharacterClass {
  hitDie: number;
  id: string;
  level: number;
  name: string;
}

/** An item a character carries: where it is, and whether it's equipped. */
interface V1Equipment {
  equipped: boolean;
  id: string;
  itemId: string;
  location: string | null;
  name: string;
  quantity: number;
  type: string | null;
  weight: number;
}

/** A feat a character has: picked at a level, given by its class at one, or granted by what it is (`level` null). */
interface V1Feat {
  given: boolean;
  id: string;
  level: number | null;
  name: string;
}

/** A level a character has: its class's level, and its hit points. */
interface V1Level {
  class: { id: string; level: number; name: string };
  hitPoints: number;
  level: number;
}

/** A saving throw of a character's. */
interface V1Save {
  name: string;
  total: number;
}

/** What a character's sheet and a bonded creature's both carry. */
interface V1Sheet {
  abilities: V1Ability[];
  alignment: string;
  armorClass: { flatFooted: number; total: number; touch: number } | null;
  baseAttackBonus: number;
  classes: V1CharacterClass[];
  equipment: V1Equipment[];
  feats: V1Feat[];
  hitPoints: number;
  id: string;
  initiative: number;
  issues: string[];
  languages: { id: string; name: string }[];
  level: number;
  levels: V1Level[];
  name: string;
  race: { id: string; name: string; size: string; speed: number };
  saves: V1Save[];
  skills: V1Skill[];
  speed: number;
  spells: V1SpellList[];
  valid: boolean;
}

/** A skill of a character's: its ranks, and its check's total. */
interface V1Skill {
  name: string;
  ranks: number;
  total: number;
  trained: boolean;
}

/** A spell list a character casts from: its spells by level, and how many it casts a day at each. */
interface V1SpellList {
  levels: { level: number; perDay: number | null; spells: { dc: number | null; id: string; name: string }[] }[];
  name: string;
}

/** A bonded creature's sheet (a familiar's, a mount's), as its master's answers it. */
type BondedSheet = CharacterSheet["bonded"][string];

/** A character's list, as the app's own API answers it. */
type CharacterList = Awaited<ReturnType<typeof CharactersService.getCharacters>>;

/** A character's sheet, as the app's own API answers it. */
type CharacterSheet = Awaited<ReturnType<typeof CharactersService.getCharacter>>;

/** What a character's sheet and its bonded creatures' share. */
type Sheet = BondedSheet | CharacterSheet;

/** A character as v1 answers it. */
export interface V1Character extends V1Sheet {
  bonded: V1BondedCreature[];
  identity: {
    age: number | null;
    deity: string;
    description: string;
    gender: string;
    height: string | null;
    notes: string;
    weight: string | null;
  };
  ruleset: { baseRules: string; id: string; name: string };
  xp: number;
}

/** A character in a list, as v1 answers it. */
export interface V1CharacterSummary {
  classes: { level: number; name: string }[];
  id: string;
  level: number;
  name: string;
  race: string;
}

/** The feats a sheet's levels picked and were given, by the character level that took them, and those it's granted. */
function toFeats(sheet: Sheet): V1Feat[] {
  const levelFeats = Object.values(sheet.classes).flatMap((klass) =>
    klass.levels.flatMap(({ characterLevel, feats }) =>
      feats.map((feat) => ({
        given: feat.given ?? false,
        id: feat.id,
        level: characterLevel.position,
        name: feat.name,
      })),
    ),
  );
  const granted = sheet.virtualFeats.map((feat) => ({ given: true, id: feat.id, level: null, name: feat.name }));
  return [...levelFeats, ...granted].sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name));
}

/** A sheet's levels, in the order the character took them. */
function toLevels(sheet: Sheet): V1Level[] {
  return Object.values(sheet.classes)
    .flatMap(({ klass, levels }) =>
      levels.map(({ characterLevel, klassLevel }) => ({
        class: { id: klass.id, level: klassLevel.level, name: klass.name },
        hitPoints: characterLevel.hp,
        level: characterLevel.position,
      })),
    )
    .sort((a, b) => a.level - b.level);
}

/** A sheet's race: its name, its size and its speed. */
function toRace({ identity }: Sheet) {
  const { race } = identity.physiology;
  return { id: race.id, name: race.name, size: race.size, speed: race.baseSpeed };
}

/** What a character's sheet and a bonded creature's both carry, from its sheet. */
function toSheet(sheet: Sheet): V1Sheet {
  const { combat, identity } = sheet;
  const ac = combat.weaponSets[0]?.ac;
  return {
    abilities: sheet.abilities.map(({ abbreviation, abilityId, modifier, name, total }) => ({
      abbreviation,
      id: abilityId,
      modifier,
      name,
      score: total,
    })),
    alignment: identity.beliefs.alignment,
    armorClass: ac ? { flatFooted: ac.flatfooted, total: ac.total, touch: ac.touch } : null,
    baseAttackBonus: combat.bab,
    classes: Object.values(sheet.classes).map(({ klass, level }) => ({
      hitDie: klass.hd,
      id: klass.id,
      level,
      name: klass.name,
    })),
    equipment: sheet.equipment.map((entry) => ({
      equipped: entry.equipped,
      id: entry.id,
      itemId: entry.itemId,
      location: entry.location,
      name: entry.name,
      quantity: entry.quantity,
      type: entry.type,
      weight: Number(entry.weight),
    })),
    feats: toFeats(sheet),
    hitPoints: combat.hp.total,
    id: sheet.id,
    initiative: combat.initiative.total,
    issues: sheet.validation.issues.map((issue) => issue.message),
    languages: identity.physiology.languages.map(({ id, name }) => ({ id, name })),
    level: identity.meta.level,
    levels: toLevels(sheet),
    name: sheet.name,
    race: toRace(sheet),
    saves: Object.values(sheet.saves).map(({ name, total }) => ({ name, total })),
    skills: Object.values(sheet.skills).map(({ name, rank, total, trained }) => ({
      name,
      ranks: rank,
      total,
      trained,
    })),
    speed: combat.speed.total,
    spells: toSpellLists(sheet),
    valid: sheet.validation.valid,
  };
}

/** A sheet's spell lists, each its spells by level, with what it casts a day at each. */
function toSpellLists(sheet: Sheet): V1SpellList[] {
  return sheet.spellGroups.map(({ aptitudeName, levels }) => ({
    levels: levels.map(({ level, spells, uses }) => ({
      level,
      perDay: uses,
      spells: spells.map(({ dc, id, name }) => ({ dc, id, name })),
    })),
    name: aptitudeName,
  }));
}

/** A character's sheet, with its bonded creatures', as v1 answers it. */
export function toV1Character(sheet: CharacterSheet): V1Character {
  const { physiology, beliefs, background, meta } = sheet.identity;
  return {
    ...toSheet(sheet),
    bonded: Object.entries(sheet.bonded).map(([bond, creature]) => ({ ...toSheet(creature), bond })),
    identity: {
      age: physiology.age ?? null,
      deity: beliefs.deity,
      description: physiology.description,
      gender: physiology.gender,
      height: physiology.height ?? null,
      notes: background.notes,
      weight: physiology.weight ?? null,
    },
    ruleset: { baseRules: sheet.baseRules, id: sheet.rulesetId, name: sheet.rulesetName },
    xp: meta.xp,
  };
}

/** A page of characters, each as v1 lists it. */
export function toV1Characters({ items, nextPage, page }: CharacterList) {
  const characters: V1CharacterSummary[] = items.map((character) => ({
    classes: character.levels.map(({ klass, level }) => ({ level, name: klass })),
    id: character.id,
    level: character.totalLevel,
    name: character.name,
    race: character.race,
  }));
  return { items: characters, nextPage: nextPage ?? null, page };
}
