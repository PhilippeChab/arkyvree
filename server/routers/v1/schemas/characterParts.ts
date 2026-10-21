/**
 * The parts of a character its edits change, as v1 answers them: its inventory, its own modifiers, its languages and
 * a saved level, each what its edit sends back.
 */

import { z } from "zod";

import { location } from "@/drizzle/schema.ts";

import { v1Character } from "./characters.ts";
import { v1Modifier } from "./content.ts";
import { buildPageSchema, v1Id, v1Named } from "./references.ts";

/** A way a new character's ability scores are set, as its form runs it by its kind. */
const v1CreationMethod = z
  .discriminatedUnion("kind", [
    z.strictObject({
      dice: z.strictObject({ count: z.number().int(), keep: z.number().int(), sides: z.number().int() }),
      id: z.string(),
      kind: z.literal("roll").meta({ description: "`count` dice of `sides`, the highest `keep` summed" }),
      label: z.string(),
    }),
    z.strictObject({
      id: z.string(),
      kind: z.literal("array").meta({ description: "The `scores`, each given to one ability" }),
      label: z.string(),
      scores: z.array(z.number().int()),
    }),
    z.strictObject({
      budget: z.number().int(),
      costs: z.array(z.strictObject({ cost: z.number().int(), score: z.number().int() })),
      id: z.string(),
      kind: z
        .literal("pointBuy")
        .meta({ description: "Each score bought at its cost, from `min` to `max`, out of `budget`" }),
      label: z.string(),
      max: z.number().int(),
      min: z.number().int(),
    }),
  ])
  .meta({ description: "A way a new character's ability scores are set", id: "CreationMethod" });

/** A language, named, with its type (`Common`, `Exotic`). */
const v1TypedLanguage = v1Named.extend({ type: z.string().nullable() });

export const v1CharacterCreation = z
  .strictObject({
    abilities: z.array(v1Named).meta({ description: "The ruleset's abilities, which a new character scores" }),
    methods: z.array(v1CreationMethod),
    modifiers: z
      .array(z.strictObject({ modifier: z.number().int(), score: z.number().int() }))
      .meta({ description: "Each score's modifier" }),
    scores: z
      .strictObject({ max: z.number().int(), min: z.number().int(), start: z.number().int() })
      .meta({ description: "A score's bounds, and where an ability the form leaves out starts" }),
  })
  .meta({ description: "How a new character of a ruleset sets its ability scores", id: "CharacterCreation" });

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

export const v1ImportedCharacter = z
  .strictObject({
    character: v1Character,
    report: z
      .strictObject({
        imported: z.array(z.string()).meta({ description: "What it imported, a line each" }),
        issues: z.array(z.string()).meta({ description: "What the rules find wrong with the character imported" }),
        program: z.string(),
        unmatched: z
          .array(z.strictObject({ line: z.number().int(), reason: z.string(), text: z.string() }))
          .meta({ description: "The file's lines it couldn't import, and why" }),
      })
      .meta({ description: "What it imported, and what it couldn't" }),
  })
  .meta({
    description: "A character imported from another program's file, with its import's report",
    id: "ImportedCharacter",
  });

export const v1InventoryEntry = z
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
    location: z
      .enum(location.enumValues)
      .nullable()
      .meta({ description: "Where it's worn or held: `Two Handed`, `Torso`, `Finger`…; none, carried" }),
    locationLabel: z.string().nullable().meta({ description: "Its location named, with its weapon sets" }),
    quantity: z.number().int(),
    weaponSets: z.array(z.number().int()).meta({ description: "The weapon sets it's held in, by index" }),
  })
  .meta({ description: "An item a character carries", id: "InventoryEntry" });

export const v1Inventory = z.array(v1InventoryEntry).meta({ description: "A character's inventory", id: "Inventory" });

export const v1Placement = z
  .strictObject({
    warning: z.string().nullable().meta({ description: "Why it can't take one more item, if it can't" }),
  })
  .meta({ description: "Whether a place a character carries an item in can take one more", id: "Placement" });

export const v1RaceOption = z
  .strictObject({
    description: z.string().nullable(),
    eligible: z.boolean().meta({ description: "Whether a character of the alignment and gender given may be one" }),
    id: v1Id,
    kind: z.string(),
    name: z.string(),
    parentId: v1Id.nullable(),
    size: z.string(),
    speed: z.number().int(),
  })
  .meta({ description: "A race a new character may be", id: "RaceOption" });

export const v1RaceOptionPage = buildPageSchema(v1RaceOption);

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
