/**
 * A ruleset's content as v1 answers it: each entity kind's columns, named, and the fields its ruleset declares for it
 * (`fields`, what a write sends back), without the database's timestamps.
 */

import { z } from "zod";

import { buildPageSchema, v1Id, v1Named } from "./references.ts";

/** What every entity has: its id, its name and its description. */
const v1Entity = z.strictObject({ description: z.string().nullable(), id: v1Id, name: z.string() });

/** An entity's fields, as its ruleset declares them (`GET /v1/rulesets/{id}/fields`), by key. */
const v1Fields = z
  .record(z.string(), z.unknown())
  .meta({ description: "Its fields, as its ruleset declares them (`GET /v1/rulesets/{id}/fields`), by key" });

/** A class's levels, each what it gives by spell level (`count`). */
const v1SpellLevelCounts = z.array(
  z.strictObject({
    level: z.number().int(),
    spells: z.array(
      z.strictObject({
        count: z
          .union([z.number().int(), z.literal("All")])
          .meta({ description: "How many, or `All`: every spell of the level its lists have" }),
        spellLevel: z.number().int(),
      }),
    ),
  }),
);

export const v1Ability = v1Entity.meta({ description: "An ability of a ruleset's (Strength)", id: "Ability" });

export const v1AbilityPage = buildPageSchema(v1Ability);

export const v1Aptitude = v1Entity.meta({
  description:
    "An aptitude of a ruleset's: a pool feats or spells are picked in (a class's bonus feats, General, a spell list)",
  id: "Aptitude",
});

export const v1AptitudePage = buildPageSchema(v1Aptitude);

export const v1Class = v1Entity
  .extend({
    fields: v1Fields,
    hitDie: z.number().int(),
    kind: z.string().meta({ description: "What takes it: `pc`, `npc`, a bonded creature's kind" }),
    parentId: v1Id.nullable().meta({ description: "The class it varies, if it's a variant" }),
  })
  .meta({ description: "A class of a ruleset's", id: "Class" });

export const v1ClassFeatPools = z
  .array(
    z.strictObject({
      aptitudes: z.array(z.strictObject({ count: z.number().int(), name: z.string() })),
      level: z.number().int(),
    }),
  )
  .meta({ description: "The feats a class's levels give to pick, each level's by aptitude", id: "ClassFeatPools" });

export const v1ClassLevel = z
  .strictObject({
    feats: z
      .array(
        v1Named.extend({
          aptitude: z.strictObject({ id: v1Id, name: z.string().nullable() }),
          free: z.boolean().meta({ description: "Whether it's granted without taking a pick of its aptitude's" }),
        }),
      )
      .meta({ description: "The feats the level grants, each with the aptitude it's granted in" }),
    fields: v1Fields,
    id: v1Id,
    level: z.number().int(),
    saves: z.array(z.strictObject({ base: z.number().int(), saveId: v1Id })),
  })
  .meta({ description: "A class's level: its base saves and the feats it grants", id: "ClassLevel" });

export const v1ClassLevels = z.array(v1ClassLevel).meta({ description: "A class's levels", id: "ClassLevels" });

export const v1ClassPage = buildPageSchema(v1Class);

export const v1ClassProgression = z
  .strictObject({
    featPicks: z
      .array(
        z.strictObject({
          aptitudes: z.array(z.strictObject({ count: z.number().int(), name: z.string() })),
          featId: v1Id,
        }),
      )
      .meta({ description: "The feats a level may grant that give picks of their own, each aptitude's" }),
    pools: z
      .array(
        z.strictObject({
          aptitude: v1Named,
          picks: z.array(z.strictObject({ count: z.number().int(), levelId: v1Id })),
        }),
      )
      .meta({ description: "The class's own pools: the picks each of its levels gives in it" }),
    severalSpellLists: z.boolean().meta({ description: "Whether its levels give slots in more than its own list" }),
    spellList: v1Named.nullable().meta({ description: "Its own spell list" }),
  })
  .meta({
    description: "What a class's progression reads beside its levels and spell tables: its pools' picks by level",
    id: "ClassProgression",
  });

export const v1ClassSpellsKnown = v1SpellLevelCounts.meta({
  description: "The spells a class's levels know, each level's by spell level",
  id: "ClassSpellsKnown",
});

export const v1ClassSpellsPerDay = v1SpellLevelCounts.meta({
  description: "The spells a class's levels cast a day, each level's by spell level",
  id: "ClassSpellsPerDay",
});

export const v1Feat = v1Entity
  .extend({
    aptitudes: z.array(v1Named).meta({ description: "The aptitudes it's picked in: a class's bonus feats, General" }),
    fields: v1Fields,
    selectable: z.boolean().meta({ description: "Whether a level picks it, rather than only grants it" }),
    stackable: z.boolean().meta({ description: "Whether a character takes it more than once" }),
  })
  .meta({ description: "A feat of a ruleset's", id: "Feat" });

export const v1FeatPage = buildPageSchema(v1Feat);

export const v1Item = v1Entity
  .extend({
    cost: z.number().nullable().meta({ description: "In gold pieces: none, unpriced" }),
    fields: v1Fields,
    slot: z.string().nullable(),
    template: z.boolean().meta({ description: "Whether it's a template other items are made from (Longsword)" }),
    templateId: v1Id.nullable().meta({ description: "The template it's made from" }),
    type: z.string().nullable(),
    weight: z.number().nullable().meta({ description: "In pounds: none, unweighed" }),
  })
  .meta({ description: "An item of a ruleset's", id: "Item" });

export const v1ItemPage = buildPageSchema(v1Item);

export const v1Items = z.array(v1Item).meta({ description: "Items", id: "Items" });

export const v1Language = v1Entity
  .extend({ type: z.string().nullable() })
  .meta({ description: "A language of a ruleset's", id: "Language" });

export const v1LanguagePage = buildPageSchema(v1Language);

export const v1Mechanic = v1Entity.meta({ description: "A mechanic of a ruleset's", id: "Mechanic" });

export const v1MechanicPage = buildPageSchema(v1Mechanic);

export const v1Modifier = z
  .strictObject({
    id: v1Id,
    operator: z.string().meta({ description: "How it applies its value: `add`, `set`…" }),
    target: z.string().meta({ description: "The path it changes (`abilities.strength.misc`)" }),
    targetLabels: z.array(z.string()).meta({ description: "Its target's segments, each named" }),
    value: z.string(),
    valueLabel: z.string().nullable().meta({ description: "Its value named, when it's an entity's id" }),
    valueType: z.enum(["boolean", "number", "string"]),
  })
  .meta({ description: "A modifier: what an entity changes of the character that has it", id: "Modifier" });

export const v1Modifiers = z.array(v1Modifier).meta({ description: "Modifiers", id: "Modifiers" });

export const v1NamedList = z.array(v1Named).meta({ description: "Things named, by id", id: "NamedList" });

export const v1Race = v1Entity
  .extend({
    fields: v1Fields,
    kind: z.string().meta({ description: "What takes it: `pc`, `npc`, a bonded creature's kind" }),
    parentId: v1Id.nullable().meta({ description: "The race it varies, if it's a variant" }),
    size: z.string(),
    speed: z.number().int(),
  })
  .meta({ description: "A race of a ruleset's", id: "Race" });

export const v1RacePage = buildPageSchema(v1Race);

export const v1Requirement = z
  .strictObject({
    chainingOperator: z
      .enum(["and", "or"])
      .nullable()
      .meta({ description: "A group's: whether its requirements all hold, or one does" }),
    group: z.string().meta({ description: "Its place in the tree: `1` the root group, `1.2` its second" }),
    id: v1Id,
    operator: z.string().nullable(),
    target: z.string().nullable().meta({ description: "The path it checks (`abilities.strength.total`)" }),
    targetLabels: z.array(z.string()).meta({ description: "Its target's segments, each named" }),
    value: z.string().nullable(),
    valueLabel: z.string().nullable().meta({ description: "Its value named, when it's an entity's id" }),
    valueType: z.enum(["boolean", "number", "string"]).nullable(),
  })
  .meta({
    description: "A requirement: what a character has to meet, a group's (`chainingOperator`) or a check's",
    id: "Requirement",
  });

export const v1Requirements = z
  .array(v1Requirement)
  .meta({ description: "A requirement tree, its groups and checks by place", id: "Requirements" });

export const v1Save = v1Entity
  .extend({ abilityId: v1Id.nullable() })
  .meta({ description: "A saving throw of a ruleset's", id: "Save" });

export const v1SavePage = buildPageSchema(v1Save);

export const v1Skill = v1Entity
  .extend({ abilityId: v1Id.nullable().meta({ description: "Its key ability" }), fields: v1Fields })
  .meta({ description: "A skill of a ruleset's", id: "Skill" });

export const v1SkillPage = buildPageSchema(v1Skill);

export const v1Spell = v1Entity
  .extend({
    aptitudes: z
      .array(v1Named.extend({ level: z.number().int().nullable() }))
      .meta({ description: "The aptitudes (spell lists) it's on, each at its level" }),
    fields: v1Fields,
    saveEffect: z.string().nullable(),
    saveId: v1Id.nullable(),
  })
  .meta({ description: "A spell of a ruleset's", id: "Spell" });

export const v1SpellPage = buildPageSchema(v1Spell);

export const v1TargetPath = z
  .strictObject({
    description: z.string(),
    detail: z.string(),
    insertText: z.string().meta({ description: "What completes the path given: its next segment, or a whole path" }),
    kind: z.enum(["category", "group", "operator", "property", "value"]),
    label: z.string(),
    operators: z.array(z.string()).meta({ description: "A whole path's: the operators it takes" }),
    path: z.string().nullable().meta({ description: "A whole path's: itself" }),
    values: z
      .array(z.strictObject({ label: z.string(), value: z.string() }))
      .meta({ description: "A whole path's: the values it takes, when it takes a closed list" }),
    valueType: z.enum(["boolean", "number", "string"]).nullable(),
  })
  .meta({ description: "A target path, or a segment of one, that completes the path given", id: "TargetPath" });

export const v1TargetPathCheck = z
  .strictObject({
    errors: z.array(
      z.strictObject({
        end: z.number().int(),
        message: z.string(),
        severity: z.enum(["error", "info", "warning"]),
        start: z.number().int(),
      }),
    ),
    suggestions: z.array(z.string()).meta({ description: "Paths it may have meant" }),
    target: z
      .strictObject({
        operators: z.array(z.string()),
        path: z.string(),
        values: z.array(z.strictObject({ label: z.string(), value: z.string() })),
        valueType: z.enum(["boolean", "number", "string"]),
      })
      .nullable()
      .meta({ description: "A valid path's: what it takes" }),
    valid: z.boolean(),
  })
  .meta({ description: "Whether a target path is one a modifier or a requirement may take", id: "TargetPathCheck" });

export const v1TargetPathPage = buildPageSchema(v1TargetPath);
