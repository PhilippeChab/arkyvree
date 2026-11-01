/**
 * What a ruleset's base rules are, as v1 answers them: the entity kinds their rulesets hold, each kind's fields, the
 * tiers a ranked list has, the names of what their progression holds, and a new character's form. What another
 * route's answer keys by the rules' own names (an entity's fields and links, a progression's values, a character's
 * fields, picks and scores) is read here.
 */

import { z } from "zod";

/** A new character's form, as its rules lay it out: what a character holds, and where. */
const v1RulesCharacterForm = z
  .strictObject({
    sections: z.array(
      z.looseObject({
        kind: z.enum(["fields", "scores"]).meta({ description: "What it sets, which its other keys follow" }),
        title: z.string(),
      }),
    ),
  })
  .meta({
    description:
      "A new character's form: a `fields` section's lines, each item a field (its `key` is where a create's " +
      "`fields` takes its value) or a pick (its `role` is where a create's `picks` takes the entity it names, whose " +
      "options `GET /v1/characters/creation/{role}` pages); a `scores` section's `role`, where a create's `scores` " +
      "takes its amounts, which `GET /v1/characters/creation` describes",
    id: "RulesCharacterForm",
  });

/** A field a kind declares, as its form shows it. */
const v1RulesField = z
  .looseObject({
    input: z.string().meta({ description: "The input it takes, which its other keys follow" }),
    label: z.string(),
  })
  .meta({ description: "A field a kind declares, as its form shows it", id: "RulesField" });

/** An entity kind the rules' rulesets hold. */
const v1RulesKind = z.strictObject({
  families: z.boolean().meta({ description: "Whether its entities fall in groups, which its `grouped` list pages" }),
  links: z
    .strictObject({ role: z.string(), type: z.string() })
    .nullable()
    .meta({ description: "The links its entities edit as their own, by role and the kind they link to" }),
  owns: z.string().nullable().meta({
    description: "The kind its entities own, which `…/{entityId}/owned` answers: none for a kind that owns none",
  }),
  partitioned: z.boolean().meta({ description: "Whether its entities are for a kind of character, its `partition`" }),
  pools: z
    .strictObject({ role: z.string(), scope: z.string(), type: z.string() })
    .nullable()
    .meta({ description: "The pools its entities are picked in: the role that lists them, the pools' kind and scope" }),
  progression: z.boolean().meta({
    description: "Whether its entities progress by level, which `…/progression` and `…/tables/{table}` answer",
  }),
  readOnly: z.boolean().meta({ description: "Whether its entities are the rules' own, which no ruleset edits" }),
  templates: z.boolean().meta({ description: "Whether it has templates, which `…/templates` answers" }),
  tiered: z.boolean().meta({ description: "Whether its lists narrow by a tier, their `tier` filter" }),
  type: z.string().meta({ description: "Its name, the kind its routes take" }),
});

/** What one base rules' rulesets are made of. */
const v1RulesDescription = z
  .strictObject({
    characterForm: v1RulesCharacterForm,
    characterKinds: z
      .array(z.strictObject({ label: z.string(), value: z.string() }))
      .meta({ description: "The kinds of character an entity's `partition` is for: a player character, and others" }),
    customizable: z.array(z.string()).meta({
      description: "The kinds whose entities have modifiers and requirements: `…/customization/{kind}/…`",
    }),
    fields: z
      .record(z.string(), z.array(v1RulesField))
      .meta({ description: "Each kind's fields, by kind, keyed in an entity's `fields` by their `field`" }),
    importers: z.array(z.string()).meta({
      description: "The programs whose files `POST /v1/characters/import` imports a character from, in the order tried",
    }),
    kinds: z.array(v1RulesKind).meta({ description: "The entity kinds its rulesets hold" }),
    progression: z
      .strictObject({
        list: z.string().nullable(),
        picks: z.string().nullable(),
        several: z.string().nullable(),
        tables: z
          .array(z.string())
          .meta({ description: "The tables a progressing entity answers at `…/tables/{table}`" }),
      })
      .meta({
        description:
          "The keys a progression's answer holds its rules' values at, past its pools: the picks a granted entity " +
          "gives (`picks`), the list its counts go to (`list`) and whether its levels count on several (`several`)",
      }),
    tiers: z
      .array(z.strictObject({ label: z.string(), level: z.number().int() }))
      .meta({ description: "The tiers a ranked list has, each by its level, its `tier` filter" }),
  })
  .meta({ description: "What one base rules' rulesets are made of", id: "RulesDescription" });

export const v1Rules = z
  .record(z.string(), v1RulesDescription)
  .meta({ description: "Each base rules' description, by the name a ruleset's `baseRules` gives", id: "Rules" });
