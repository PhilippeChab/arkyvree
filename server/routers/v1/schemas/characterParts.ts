/**
 * The parts of a character its edits change, as v1 answers them: its inventory, its own modifiers, its languages and
 * a saved level, each what its edit sends back.
 */

import { z } from "zod";

import { v1Modifier } from "./content.ts";
import { v1Id, v1Named } from "./references.ts";

const v1InventoryEntry = z
  .strictObject({
    charges: z
      .strictObject({ remaining: z.number().int().nullable(), total: z.number().int().nullable() })
      .nullable()
      .meta({ description: "Its charges, for an item that has them" }),
    equipped: z.boolean(),
    id: v1Id,
    item: z.strictObject({
      id: v1Id,
      name: z.string(),
      slot: z.string().nullable(),
      type: z.string().nullable(),
      weight: z.number().nullable().meta({ description: "In pounds: none, unweighed" }),
    }),
    location: z.string().nullable().meta({ description: "Where it's worn or held: `Two Handed`, `Torso`, `Backpack`" }),
    locationLabel: z.string().nullable().meta({ description: "Its location named, with its weapon sets" }),
    quantity: z.number().int(),
    weaponSets: z.array(z.number().int()).meta({ description: "The weapon sets it's held in, by index" }),
  })
  .meta({ description: "An item a character carries", id: "InventoryEntry" });

/** A language, named, with its type (`Common`, `Exotic`). */
const v1TypedLanguage = v1Named.extend({ type: z.string().nullable() });

export const v1CharacterLanguages = z
  .strictObject({
    automatic: z.array(v1TypedLanguage).meta({ description: "The languages its race and classes give it" }),
    options: z.array(v1TypedLanguage).meta({ description: "The languages it may still pick, besides `picks`" }),
    picks: z
      .array(v1TypedLanguage)
      .meta({ description: "The languages it picked, past those its race and classes give it" }),
  })
  .meta({
    description:
      "What a character speaks: the languages it picked, those its race and classes give it, and those it may add",
    id: "CharacterLanguages",
  });

export const v1CharacterModifiers = z
  .array(v1Modifier)
  .meta({ description: "A character's own modifiers, which its owner adds", id: "CharacterModifiers" });

export const v1Inventory = z.array(v1InventoryEntry).meta({ description: "A character's inventory", id: "Inventory" });

export const v1SavedLevel = z
  .strictObject({
    abilityIncreases: z.array(z.strictObject({ abilityId: v1Id, amount: z.number().int() })),
    class: z
      .strictObject({ id: v1Id, level: z.number().int(), name: z.string() })
      .meta({ description: "Its class, and the class's level it is" }),
    feats: z.array(z.strictObject({ aptitudeId: v1Id, featId: v1Id, name: z.string() })),
    hitDie: z.number().int(),
    hitPoints: z.number().int(),
    hitPointsRange: z
      .strictObject({ average: z.number().int(), max: z.number().int(), min: z.number().int() })
      .meta({ description: "What its hit die may give it" }),
    id: v1Id,
    skillPoints: z.record(z.string(), z.number().int()).meta({ description: "The points it spent, by skill id" }),
    spells: z.array(
      z.strictObject({ aptitudeId: v1Id, name: z.string(), spellId: v1Id, spellLevel: z.number().int().nullable() }),
    ),
  })
  .meta({ description: "A level a character took: what it picked, as its edit sends it back", id: "SavedLevel" });
