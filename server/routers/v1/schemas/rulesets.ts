/** A ruleset as v1 answers it: what it is, its settings, the fields it declares, its extensions and its changes. */

import { z } from "zod";

import { buildPageSchema, v1Id } from "./references.ts";

/**
 * When a form shows a field: while every condition holds, each the value at its `path` (a field's, `fields.<key>`, or a
 * column's) in its `values`, or, `except`, not.
 */
const v1ShownWhen = z.array(
  z.strictObject({
    except: z.boolean().optional(),
    path: z.string(),
    values: z.array(z.union([z.boolean(), z.string()])),
  }),
);

/** What every declared field has. */
const v1FieldBase = z.strictObject({
  help: z.string(),
  key: z.string().meta({ description: "Where its value goes in `fields`: its key, under its group's" }),
  label: z.string(),
  shownWhen: v1ShownWhen.optional(),
});

/** What levels give of something: one every `every` levels, and more at the levels `extra` names. */
const v1Progression = z.strictObject({
  every: z.number().int(),
  extra: z.array(z.strictObject({ amount: z.number().int(), level: z.number().int() })),
});

/** A field a ruleset declares for an entity kind: its label, what it's for, and the input it takes. */
const v1FieldDeclaration: z.ZodType<unknown> = z
  .discriminatedUnion("input", [
    v1FieldBase.extend({ input: z.literal("choice"), multiple: z.boolean(), options: z.array(z.string()) }),
    v1FieldBase.extend({ input: z.literal("flag"), nullable: z.boolean() }),
    z.strictObject({
      get fields() {
        return z.array(v1FieldDeclaration);
      },
      input: z.literal("group"),
      key: z.string(),
      label: z.string(),
      shownWhen: v1ShownWhen.optional(),
    }),
    v1FieldBase.extend({
      default: z.number().nullable(),
      input: z.literal("number"),
      max: z.number().optional(),
      min: z.number().optional(),
    }),
    v1FieldBase.extend({
      default: v1Progression,
      input: z.literal("progression"),
      levels: z.number().int(),
      max: z.number().int(),
    }),
    v1FieldBase.extend({
      input: z.literal("ref"),
      references: z.string().meta({ description: "The kind of entity it names: `abilities`, `classes`" }),
      required: z.boolean(),
    }),
    v1FieldBase.extend({ input: z.literal("text"), multiple: z.boolean(), placeholder: z.string().optional() }),
  ])
  .meta({ description: "A field a ruleset declares for an entity kind", id: "FieldDeclaration" });

export const v1FieldDeclarations = z.record(z.string(), z.array(v1FieldDeclaration)).meta({
  description:
    "The fields a ruleset declares, by entity kind (`classes`, `class-levels`, `feats`, `items`, `races`, " +
    "`rulesets`, `skills`, `spells`): what an entity's `fields` hold, and what a write sends in them",
  id: "FieldDeclarations",
});

export const v1Ruleset = z
  .strictObject({
    baseRules: z.string().meta({ description: "The game its rules are: `Dungeons & Dragons: 3.5`" }),
    description: z.string(),
    extensionIds: z.array(v1Id).meta({ description: "The extensions it's subscribed to" }),
    id: v1Id,
    kind: z.string().meta({ description: "`ruleset`, or `extension`: content other rulesets subscribe to" }),
    name: z.string(),
    parentId: v1Id.nullable().meta({ description: "The ruleset it's forked from" }),
    private: z.boolean(),
    starCount: z.number().int(),
    starred: z.boolean().meta({ description: "Whether the key's user starred it" }),
    status: z.string().meta({ description: "`Draft`, or `Published`: others see it" }),
    system: z.boolean().meta({ description: "One of the app's own, which no user owns" }),
  })
  .meta({ description: "A ruleset", id: "Ruleset" });

export const v1RulesetChanges = z
  .array(
    z.strictObject({
      entityId: v1Id.nullable().meta({ description: "The ruleset's own entity, none when it's deleted" }),
      kind: z.string().meta({ description: "The entity's kind, as its route names it: `classes`, `feats`" }),
      name: z.string(),
      sourceId: v1Id.nullable().meta({ description: "The entity it changes of its parent's, none when it's added" }),
      status: z.enum(["added", "deleted", "modified"]),
    }),
  )
  .meta({ description: "What a fork changed of the ruleset it's forked from", id: "RulesetChanges" });

export const v1RulesetExtensions = z
  .array(
    z.strictObject({
      description: z.string().nullable(),
      id: v1Id,
      name: z.string(),
      subscribedAt: z.string(),
      updateAvailable: z.boolean().meta({ description: "Whether it changed since the ruleset subscribed to it" }),
    }),
  )
  .meta({ description: "The extensions a ruleset is subscribed to", id: "RulesetExtensions" });

export const v1RulesetPage = buildPageSchema(v1Ruleset);

export const v1RulesetSettings = z.strictObject({ fields: z.record(z.string(), z.unknown()) }).meta({
  description: "A ruleset's settings: its own fields, as it declares them (`rulesets`, in its fields)",
  id: "RulesetSettings",
});
