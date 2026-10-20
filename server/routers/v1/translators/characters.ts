/**
 * A character as v1 answers it: its sheet, each thing it has named (its feats "Power Attack", with their ids beside
 * them), without the parts only the app's screens read (every modifier and requirement, the database's timestamps, the
 * owner's private notes).
 */

import type { z } from "zod";

import type { v1Character, v1CharacterSummary } from "@/server/routers/v1/schemas/characters.ts";
import type { CharactersService } from "@/server/services/characters/index.ts";

import { toV1Page } from "./pages.ts";

/** A bonded creature's sheet (a familiar's, a mount's), as its master's answers it. */
type BondedSheet = CharacterSheet["bonded"][string];

/** A character's list, as the app's own API answers it. */
type CharacterList = Awaited<ReturnType<typeof CharactersService.getCharacters>>;

/** A character's sheet, as the app's own API answers it. */
type CharacterSheet = Awaited<ReturnType<typeof CharactersService.getCharacter>>;

/** What a character's sheet and its bonded creatures' share. */
type Sheet = BondedSheet | CharacterSheet;

/** A character as v1 answers it. */
type V1Character = z.infer<typeof v1Character>;

/** What a character's sheet and a bonded creature's both carry. */
type V1Sheet = Omit<V1Character, "bonded" | "identity" | "ruleset" | "xp">;

/** The feats a sheet's levels picked and were given, by the character level that took them, and those it's granted. */
function toFeats(sheet: Sheet): V1Sheet["feats"] {
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
function toLevels(sheet: Sheet): V1Sheet["levels"] {
  return Object.values(sheet.classes)
    .flatMap(({ klass, levels }) =>
      levels.map(({ characterLevel, klassLevel }) => ({
        class: { id: klass.id, level: klassLevel.level, name: klass.name },
        hitPoints: characterLevel.hp,
        id: characterLevel.id,
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
function toSpellLists(sheet: Sheet): V1Sheet["spells"] {
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
export function toV1Characters(page: CharacterList) {
  return toV1Page(page, (character): z.infer<typeof v1CharacterSummary> => ({
    classes: character.levels.map(({ klass, level }) => ({ level, name: klass })),
    id: character.id,
    level: character.totalLevel,
    name: character.name,
    race: character.race,
  }));
}
