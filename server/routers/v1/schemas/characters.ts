/**
 * A character as v1 answers it: its sheet, each thing it has named (its feats "Power Attack", with their ids beside
 * them), without the parts only the app's screens read (every modifier and requirement, the database's timestamps, the
 * owner's private notes).
 */

import { z } from "zod";

import { buildPageSchema, v1Id, v1Named } from "./references.ts";

const v1Ability = z
  .strictObject({
    abbreviation: z.string(),
    id: v1Id,
    modifier: z.number().int(),
    name: z.string(),
    score: z.number().int(),
  })
  .meta({ description: "An ability score of a character's", id: "CharacterAbility" });

const v1CharacterClass = z
  .strictObject({ hitDie: z.number().int(), id: v1Id, level: z.number().int(), name: z.string() })
  .meta({ description: "A class a character has levels in", id: "CharacterClass" });

const v1CharacterFeat = z
  .strictObject({
    given: z.boolean().meta({ description: "Given by its class or by what the character is, not picked" }),
    id: v1Id,
    level: z.number().int().nullable().meta({ description: "The character level that took it, null when granted" }),
    name: z.string(),
  })
  .meta({ description: "A feat a character has", id: "CharacterFeat" });

const v1CharacterLevel = z
  .strictObject({
    class: z.strictObject({ id: v1Id, level: z.number().int(), name: z.string() }),
    hitPoints: z.number().int(),
    id: v1Id.meta({ description: "The level's own id: `GET /v1/characters/{id}/levels/{levelId}` reads its picks" }),
    level: z.number().int(),
  })
  .meta({ description: "A level a character has: its class's level, and its hit points", id: "CharacterLevel" });

const v1CharacterSkill = z
  .strictObject({ name: z.string(), ranks: z.number(), total: z.number(), trained: z.boolean() })
  .meta({ description: "A skill of a character's: its ranks, and its check's total", id: "CharacterSkill" });

const v1Equipment = z
  .strictObject({
    equipped: z.boolean(),
    id: v1Id.meta({ description: "The inventory entry's id" }),
    itemId: v1Id,
    location: z.string().nullable(),
    name: z.string(),
    quantity: z.number().int(),
    type: z.string().nullable(),
    weight: z.number().nullable().meta({ description: "In pounds: none, unweighed" }),
  })
  .meta({ description: "An item a character carries: where it is, and whether it's equipped", id: "Equipment" });

const v1SpellList = z
  .strictObject({
    levels: z.array(
      z.strictObject({
        level: z.number().int(),
        perDay: z.number().int().nullable(),
        spells: z.array(z.strictObject({ dc: z.number().int().nullable(), id: v1Id, name: z.string() })),
      }),
    ),
    name: z.string(),
  })
  .meta({
    description: "A spell list a character casts from: its spells by level, and how many it casts a day at each",
    id: "CharacterSpellList",
  });

/** What a character's sheet and a bonded creature's both carry. */
const v1Sheet = z.strictObject({
  abilities: z.array(v1Ability),
  alignment: z.string(),
  armorClass: z
    .strictObject({ flatFooted: z.number().int(), total: z.number().int(), touch: z.number().int() })
    .nullable(),
  baseAttackBonus: z.number().int(),
  classes: z.array(v1CharacterClass),
  equipment: z.array(v1Equipment),
  feats: z.array(v1CharacterFeat),
  hitPoints: z.number().int(),
  id: v1Id,
  initiative: z.number().int(),
  issues: z.array(z.string()).meta({ description: "What makes the character invalid, by the rules" }),
  languages: z.array(v1Named),
  level: z.number().int(),
  levels: z.array(v1CharacterLevel),
  name: z.string(),
  race: z.strictObject({ id: v1Id, name: z.string(), size: z.string(), speed: z.number().int() }),
  saves: z.array(z.strictObject({ name: z.string(), total: z.number().int() })),
  skills: z.array(v1CharacterSkill),
  speed: z.number().int(),
  spells: z.array(v1SpellList),
  valid: z.boolean(),
});

const v1BondedCreature = v1Sheet
  .extend({ bond: z.string().meta({ description: "What the creature is to its master: `familiar`, `mount`…" }) })
  .meta({
    description: "A bonded creature of a character's (its familiar, its animal companion, its mount)",
    id: "BondedCreature",
  });

export const v1Character = v1Sheet
  .extend({
    bonded: z.array(v1BondedCreature),
    identity: z.strictObject({
      age: z.number().int().nullable(),
      deity: z.string(),
      description: z.string(),
      gender: z.string(),
      height: z.string().nullable(),
      notes: z.string(),
      weight: z.string().nullable(),
    }),
    ruleset: z.strictObject({ baseRules: z.string(), id: v1Id, name: z.string() }),
    xp: z.number().int(),
  })
  .meta({ description: "A character's sheet, with its bonded creatures'", id: "Character" });

export const v1CharacterSummary = z
  .strictObject({
    classes: z.array(z.strictObject({ level: z.number().int(), name: z.string() })),
    id: v1Id,
    level: z.number().int(),
    name: z.string(),
    race: z.string(),
  })
  .meta({ description: "A character in a list", id: "CharacterSummary" });

export const v1CharacterPage = buildPageSchema(v1CharacterSummary);
