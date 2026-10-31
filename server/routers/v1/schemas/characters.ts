/**
 * A character as v1 answers it: a card in a page of them, its sheet, the parts its edits change (its inventory, its own
 * modifiers, its links of a role) and its levels' plans.
 */

import { z } from "zod";

import { planSteps } from "@/server/routers/api/validation.ts";

import { buildPageSchema, v1Id, v1Named } from "./references.ts";

/** What the key's user may do with a character. */
const v1CharacterPermissions = z
  .strictObject({
    canArchive: z.boolean(),
    canEdit: z.boolean(),
    canEditPortrait: z.boolean(),
    canInviteContributors: z.boolean(),
    canLeave: z.boolean(),
    canManageContributors: z.boolean(),
    canReadContributors: z.boolean(),
    canShare: z.boolean(),
  })
  .meta({ description: "What the key's user may do with the character", id: "CharacterPermissions" });

/** How many of a pool's picks are allowed, spent and left. */
const v1Room = z.strictObject({ allowed: z.number(), available: z.number(), spent: z.number() });

/** An issue the rules find with a character. */
const v1RulesIssue = z
  .strictObject({
    category: z.string().meta({ description: "What the issue is about: `aptitudes`, `skills`, `requirements`…" }),
    entityId: z.string().optional(),
    entityName: z.string().optional(),
    entityType: z.string().optional(),
    message: z.string(),
    requirementTree: z.string().optional().meta({ description: "The requirements unmet, when it's about them" }),
    tier: z.number().optional(),
  })
  .meta({ description: "Something the rules find wrong with a character", id: "RulesIssue" });

/** A section of a character's sheet, as the app shows it. */
const v1SheetSection = z
  .looseObject({
    key: z.string(),
    kind: z
      .enum(["entries", "fields", "inventory", "pools", "scores", "stats", "table"])
      .meta({ description: "How it lays its values out, which its other keys follow" }),
    title: z.string(),
  })
  .meta({
    description:
      "A section of the sheet, as the engine describes it for the app: its values (`fields`, `scores`, `stats`, a " +
      "`table`'s rows, `entries`, `pools`, an inventory's `rows`) with the words the app shows them by",
    id: "SheetSection",
  });

/** A plan's answer to each step, by its mechanic. */
const v1StepAnswer = z.discriminatedUnion("mechanic", [
  z.strictObject({
    advancements: z.array(z.number()),
    amount: z.number(),
    chosen: z.boolean(),
    mechanic: z.literal("choose"),
    options: z.array(
      z.strictObject({ abbreviation: z.string(), id: v1Id, modifier: z.number(), name: z.string(), score: z.number() }),
    ),
  }),
  z.strictObject({
    fitted: z.record(z.string(), z.array(z.string())),
    granted: z.array(
      z.strictObject({ description: z.string().nullable(), free: z.boolean(), id: v1Id, name: z.string() }),
    ),
    grouped: z.boolean(),
    mechanic: z.literal("pick"),
    next: z.record(z.string(), z.record(z.string(), z.number())),
    picked: z.record(
      z.string(),
      z.array(
        z.strictObject({ description: z.string().nullable(), id: v1Id, name: z.string(), tier: z.string().optional() }),
      ),
    ),
    pools: z.record(
      z.string(),
      v1Room.extend({
        id: v1Id,
        name: z.string(),
        optional: z.boolean(),
        tiers: z.record(z.string(), v1Room).optional(),
      }),
    ),
  }),
  z.strictObject({ mechanic: z.literal("plan") }),
  z.strictObject({
    budget: z.number(),
    mechanic: z.literal("spend"),
    perAdvancement: z.array(z.number()),
    rows: z.array(
      z.strictObject({
        current: z.number(),
        description: z.string().nullable(),
        favored: z.boolean(),
        group: z.string().nullable(),
        id: v1Id,
        maxPoints: z.number(),
        name: z.string(),
        points: z.number(),
        shortName: z.string(),
        step: z.number(),
        value: z.number(),
        valuesByPoints: z.array(z.number()),
      }),
    ),
  }),
  z.strictObject({
    advancements: z.array(z.strictObject({ average: z.number(), max: z.number(), min: z.number(), roll: z.string() })),
    mechanic: z.literal("value"),
  }),
]);

/** An option a step offers: an entity, eligible or not. */
const v1StepOption = z.strictObject({
  description: z.string().nullable(),
  eligible: z.boolean(),
  id: v1Id,
  name: z.string(),
  requirementTree: z.string().optional().meta({ description: "What it requires, when the character doesn't meet it" }),
  track: z
    .strictObject({ last: z.number(), left: z.number(), next: z.number() })
    .optional()
    .meta({ description: "A track's levels (a class's): its last, how many are left, the next" }),
});

/** A group of a step's options (a feat's family). */
const v1StepOptionGroup = z.strictObject({
  count: z.number(),
  description: z.string().nullable(),
  eligible: z.boolean(),
  group: z.string().nullable(),
  id: v1Id,
  name: z.string(),
  requirementTree: z.string().optional(),
});

/** A character's sheet. */
export const v1Character = z
  .strictObject({
    archived: z.boolean(),
    id: v1Id,
    kind: z.string().meta({ description: "Its kind: a player character's, or a bonded creature's (`familiar`…)" }),
    name: z.string(),
    ownerId: z.string().nullable(),
    parentCharacterId: z
      .string()
      .nullable()
      .meta({ description: "A bonded creature's master, whose editors read and edit it" }),
    permissions: v1CharacterPermissions,
    rulesetId: v1Id,
    rulesetName: z.string(),
    sections: z.array(v1SheetSection).meta({ description: "Its sheet's sections, in the order the app shows them" }),
    shareToken: z.string().nullable().meta({ description: "Its share link's token, none while it isn't shared" }),
    updatedAt: z.string(),
    validation: z
      .strictObject({ issues: z.array(v1RulesIssue), valid: z.boolean() })
      .meta({ description: "What the rules find wrong with it, none when it's valid" }),
  })
  .meta({ description: "A character's sheet", id: "Character" });

/** A character in a page of the user's, as its card shows it. */
export const v1CharacterCard = z
  .strictObject({
    accessRole: z.enum(["owner", "contributor"]).meta({ description: "Whether the user owns it or contributes to it" }),
    description: z.string().nullable(),
    id: v1Id,
    name: z.string(),
    summary: z
      .array(z.strictObject({ label: z.string(), partial: z.boolean() }))
      .meta({ description: "What its card shows of it (its race, each class with its level), partial when unknown" }),
  })
  .meta({ description: "A character, as its card shows it", id: "CharacterCard" });

export const v1CharacterPage = buildPageSchema(v1CharacterCard);

/** An item a character carries. */
export const v1InventoryEntry = z
  .strictObject({
    charges: z
      .strictObject({ remaining: z.number().nullable(), total: z.number().nullable() })
      .nullable()
      .meta({ description: "Its charges, for an item that has them" }),
    groups: z.array(z.number()).meta({ description: "The weapon sets a hand holds it in, from 0" }),
    id: v1Id,
    item: z
      .strictObject({
        description: z.string().nullable(),
        fields: z.record(z.string(), z.unknown()),
        id: v1Id,
        name: z.string(),
      })
      .meta({ description: "The item, its fields by the names its ruleset declares them" }),
    location: z.string().nullable().meta({ description: "Where it's worn or held, none for an item carried" }),
    quantity: z.number(),
    slotLabel: z.string().nullable().meta({ description: "Where it's worn, as its sheet names it" }),
    updatedAt: z.string(),
  })
  .meta({ description: "An item a character carries", id: "InventoryEntry" });

export const v1Inventory = z.array(v1InventoryEntry);

/** A level plan: each step's payload, by its name, and the level it edits, when it edits one. */
export const v1LevelPlan = z
  .strictObject({
    editedLevelId: v1Id.optional().meta({ description: "The level it edits, when it edits one" }),
    steps: planSteps.meta({ description: "Each step's payload, by its name, in its mechanic's shape" }),
  })
  .meta({ description: "A level plan: each step's payload by its name", id: "LevelPlan" });

/** What a level plan comes to: the levels it adds, and each step's answer. */
export const v1LevelPlanAnswer = z
  .strictObject({
    advancements: z.array(z.strictObject({ id: v1Id, position: z.number(), track: v1Named })),
    steps: z.record(z.string(), v1StepAnswer).meta({ description: "Each step's answer, by its name" }),
  })
  .meta({ description: "What a level plan comes to: its levels, and each step's answer", id: "LevelPlanAnswer" });

/** A level's steps, as its ruleset lists them. */
export const v1LevelSteps = z
  .strictObject({
    steps: z.array(
      z.strictObject({
        kind: z.string().optional().meta({ description: "The entity kind it reads or picks: `classes`, `feats`…" }),
        label: z.string(),
        mechanic: z
          .enum(["choose", "pick", "plan", "spend", "value"])
          .meta({ description: "How its payload is shaped, in a plan's `steps`" }),
        name: z.string().meta({ description: "Its name, a plan's `steps` key" }),
        pools: z.string().optional().meta({ description: "The kind its picks' pools are of: `aptitudes`" }),
      }),
    ),
  })
  .meta({
    description: "A level's steps, in their order: a plan's payloads are keyed by their names",
    id: "LevelSteps",
  });

/** A character's links of a role (the languages it speaks): those it picked, those it has anyway, those it may add. */
export const v1LinkRoom = z
  .strictObject({
    automatic: z.array(v1Named).meta({ description: "Those it has without picking them" }),
    options: z.array(v1Named).meta({ description: "Those it may pick" }),
    picks: z.array(v1Named).meta({ description: "Those it picked" }),
  })
  .meta({ description: "A character's links of a role: its picks, those it has anyway, its options", id: "LinkRoom" });

/** A modifier, a character's own or an entity's: what it changes, how, and by what. */
export const v1Modifier = z
  .strictObject({
    id: v1Id,
    operator: z.string().meta({ description: "`add`, `subtract`, `multiply`, `divide` or `set`" }),
    target: z.string().meta({ description: "The path it changes: `abilities.strength.misc`…" }),
    targetLabels: z.record(z.string(), z.string()).meta({ description: "Its path's segments, each by its label" }),
    value: z.string(),
    valueLabel: z.string().nullable().meta({ description: "Its value as its target names it, when it names one" }),
    valueType: z.string(),
  })
  .meta({ description: "A modifier: what it changes, how, and by what", id: "Modifier" });

export const v1Modifiers = z.array(v1Modifier);

/** A page of a step's options, or of its groups of options. */
export const v1StepOptions = z
  .strictObject({
    grouped: z.boolean().meta({ description: "Whether its items are groups, each a query's `group` opens" }),
    items: z.array(z.union([v1StepOption, v1StepOptionGroup])),
    nextPage: z.number().nullable(),
    page: z.number(),
  })
  .meta({ description: "A page of a step's options, or of its groups of options", id: "StepOptions" });
