/**
 * What a ruleset's base rules are, as v1 answers them: the entity kinds their rulesets hold, each kind's fields, the
 * tiers a ranked list has, and the names of what their progression and characters hold. What another route's answer
 * keys by the rules' own names (an entity's fields, a progression's values) is read here.
 */

import { z } from "zod";

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
  partitioned: z.boolean().meta({ description: "Whether its entities are for a kind of character, its `partition`" }),
  pools: z
    .strictObject({ role: z.string(), scope: z.string(), type: z.string() })
    .nullable()
    .meta({ description: "The pools its entities are picked in: the role that lists them, the pools' kind and scope" }),
  readOnly: z.boolean().meta({ description: "Whether its entities are the rules' own, which no ruleset edits" }),
  tiered: z.boolean().meta({ description: "Whether its lists narrow by a tier, their `tier` filter" }),
  type: z.string().meta({ description: "Its name, the kind its routes take" }),
});

/** What one base rules' rulesets are made of. */
const v1RulesDescription = z
  .strictObject({
    characterKinds: z
      .array(z.strictObject({ label: z.string(), value: z.string() }))
      .meta({ description: "The kinds of character an entity's `partition` is for: a player character, and others" }),
    fields: z
      .record(z.string(), z.array(v1RulesField))
      .meta({ description: "Each kind's fields, by kind, keyed in an entity's `fields` by their `field`" }),
    kinds: z.array(v1RulesKind).meta({ description: "The entity kinds its rulesets hold" }),
    progression: z
      .strictObject({ list: z.string().nullable(), picks: z.string().nullable(), several: z.string().nullable() })
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
