/**
 * The D&D 5th Edition entities' fields: each entity type's, and a ruleset's Settings', in the order a stat block shows
 * them (and its form its fields), each declared once, as data the engine stores, reads and takes from a form by (its
 * kind's codec, `FieldCodec`, and its storage, `Engine.forRules(baseRules).storage()`; `FieldSpec` is a declaration's
 * shape): its name, the stored field that keeps it (a link's, the role of its owner's links: a reference's single link,
 * a list of links its form edits), its label and what it's for, its kind, its closed list of values or the entity its
 * value names, its default, scale and bounds, whether a form must give it (`required`), how sibling copies merge it,
 * the role its entity reads it off another through (an item's, its template's), and how its form shows it: where
 * (`placement`, `shownIn`), on what (`shownWhen`), in its unit, by its values' labels, or not at all (`form`). A field
 * merges by what its value is:
 * - a set (a list) holds every copy's values (`union`);
 * - a value that reads apart from the others falls back to a sibling's when the winning copy holds none (`fallback`);
 * - a value its entity is read by, with its others, is the winning copy's alone (`winner`), so no stat line mixes two
 *   copies' readings: a class's hit die, a feat's flags, an item's type, slot, cost and weight and whether it's a
 *   template, a language's type, a species' size and speed.
 *
 * A field whose values name groupings across its kind (`kindWide`: a weapon's type, a feat's family, a spell's school)
 * is read kind-wide, as the target paths label them: an item's, a feat's and a spell's but those its rules set or its
 * form shows beside its name (an item's type, slot, cost, weight and template flag, a feat's flags).
 */

import { ARMOR_CATEGORIES, ARMOR_NAMES } from "@/vocabulary/dnd5.2/armor.ts";
import { CASTER_TYPES, DEFAULT_HIT_DIE, HIT_DIE_LABELS, HIT_DIE_VALUES } from "@/vocabulary/dnd5.2/classes.ts";
import { LOCATION_OPTIONS } from "@/vocabulary/dnd5.2/equipment.ts";
import { FEAT_FAMILIES } from "@/vocabulary/dnd5.2/feats.ts";
import { ITEM_RARITIES, ITEM_TYPES, TEMPLATE_ITEM_TYPES } from "@/vocabulary/dnd5.2/itemTemplates.ts";
import { SIZE_OPTIONS } from "@/vocabulary/dnd5.2/sizes.ts";
import { MAX_SPELL_LEVEL, SPELL_COMPONENTS, SPELL_SCHOOLS } from "@/vocabulary/dnd5.2/spells.ts";
import {
  DAMAGE_TYPES,
  MASTERY_PROPERTIES,
  WEAPON_CATEGORIES,
  WEAPON_NAMES,
  WEAPON_PROPERTIES as WEAPON_PROPERTY_NAMES,
} from "@/vocabulary/dnd5.2/weapons.ts";

import {
  ARMOR_CATEGORY,
  ARMOR_CLASS,
  ARMOR_MAX_DEX,
  ARMOR_STEALTH_DISADVANTAGE,
  ARMOR_STRENGTH,
  ARMOR_TYPE,
} from "./armor.ts";
import { CLASS_CASTER_TYPE, CLASS_HD } from "./class.ts";
import { FEAT_FAMILY, FEAT_GENERATED, FEAT_SELECTABLE, FEAT_STACKABLE } from "./feat.ts";
import {
  ITEM_ATTUNEMENT,
  ITEM_CHARGES,
  ITEM_COST_GP,
  ITEM_IS_TEMPLATE,
  ITEM_RARITY,
  ITEM_SLOT,
  ITEM_TYPE,
  ITEM_WEIGHT,
} from "./item.ts";
import { LANGUAGE_TYPE } from "./language.ts";
import { SHIELD_AC_BONUS } from "./shield.ts";
import { SPECIES_SIZE, SPECIES_SPEED } from "./species.ts";
import {
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_CONCENTRATION,
  SPELL_DURATION,
  SPELL_MATERIAL,
  SPELL_RANGE,
  SPELL_RITUAL,
  SPELL_SCHOOL,
} from "./spell.ts";
import {
  WEAPON_CATEGORY,
  WEAPON_DAMAGE,
  WEAPON_DAMAGE_TYPE,
  WEAPON_LONG_RANGE,
  WEAPON_MASTERY,
  WEAPON_PROPERTIES,
  WEAPON_RANGE,
  WEAPON_RANGED,
  WEAPON_TYPE,
  WEAPON_VERSATILE_DAMAGE,
} from "./weapon.ts";

/** What a new feat's or spell's form says of its empty list of pools, which it refuses. */
const APTITUDES_REQUIRED = "At least one aptitude must be selected";

/** A template's form: whether it's one isn't a field its form changes. */
const AS_TEMPLATE = { field: ITEM_IS_TEMPLATE, values: [true] } as const;

/**
 * A background's fields: the three abilities its increases go to (its `abilityScore` links), which its form shows
 * beside its name. What else it gives (its Origin feat, its skills, its tool) its modifiers grant.
 */
const BACKGROUND_FIELDS = {
  abilityScores: {
    description: "The three abilities its ability score increases go to",
    kind: "links",
    label: "Ability Scores",
    placement: "beside-name",
    references: "abilities",
    role: "abilityScore",
  },
} as const;

/**
 * A class's fields: its hit die (one of the dice, beside its name; a new class's `DEFAULT_HIT_DIE` when its form gives
 * none), its caster type and the ability its spells are cast with, and the feats its starting proficiencies are: the
 * one a character gains when the class is its first (its saving throws, armor, weapons and skill picks), and the one
 * it gains when it multiclasses into it, which the SRD's Multiclassing rules make smaller.
 */
const CLASS_FIELDS = {
  hitDie: {
    default: DEFAULT_HIT_DIE,
    description: "The die each of the class's levels rolls for hit points",
    kind: "number",
    label: "Hit Die",
    labels: HIT_DIE_LABELS,
    placement: "beside-name",
    field: CLASS_HD,
    merge: "winner",
    values: HIT_DIE_VALUES,
    write: "always",
  },
  casterType: {
    default: "None",
    description: "How its levels count toward a multiclassed character's spell slots",
    kind: "choice",
    label: "Caster Type",
    field: CLASS_CASTER_TYPE,
    merge: "fallback",
    values: CASTER_TYPES,
    write: "always",
  },
  spellcastingAbility: {
    description: "The ability its spells are cast with: their save DC's and their attack bonus's",
    kind: "ref",
    label: "Spellcasting Ability",
    references: "abilities",
    role: "spellcastingAbility",
  },
  startingProficiencies: {
    description: "The feat a character gains with its first level, when the class is its first",
    kind: "ref",
    label: "Starting Proficiencies",
    references: "feats",
    role: "startingProficiencies",
  },
  multiclassProficiencies: {
    description: "The feat a character gains with its first level in the class, when it multiclasses into it",
    kind: "ref",
    label: "Multiclass Proficiencies",
    references: "feats",
    role: "multiclassProficiencies",
  },
} as const;

/**
 * A class level's fields: the feats it grants (its features, and a pool's picks it gives through a feat's modifiers),
 * each through the pool it's taken for (its `grants` links).
 */
const CLASS_LEVEL_FIELDS = {
  grants: {
    description: "Select feats with aptitudes granted at this level",
    entries: "grant",
    kind: "links",
    label: "Feats",
    references: "feats",
    role: "grants",
    via: "aptitudes",
  },
} as const;

/**
 * A feat's fields: the pools it's picked in (its `listedIn` links beside its name, a new one needs one: its category's,
 * an Origin feat's, a General one's…), whether a character takes it more than once (Stackable, the SRD's "Repeatable",
 * which a class grants it at several levels by too), whether a level up picks it and whether its ruleset made it
 * (which its rules set: no form shows them), each of those three always written, and the families it's in.
 */
const FEAT_FIELDS = {
  listedIn: {
    description: "The feat pools it's picked in",
    kind: "links",
    label: "Aptitudes",
    placement: "beside-name",
    references: "aptitudes",
    required: APTITUDES_REQUIRED,
    role: "listedIn",
  },
  stackable: {
    description: "Whether a character can take the feat more than once, and a class grant it at several levels",
    kind: "flag",
    label: "Repeatable",
    field: FEAT_STACKABLE,
    merge: "winner",
    write: "always",
  },
  selectable: {
    default: true,
    description: "Whether a level up picks the feat (false: it's only granted)",
    form: "hidden",
    kind: "flag",
    label: "Selectable",
    field: FEAT_SELECTABLE,
    merge: "winner",
    write: "always",
  },
  generated: {
    description: "Whether its ruleset generated the feat (Skill Proficiency in a skill)",
    form: "hidden",
    kind: "flag",
    label: "Generated",
    field: FEAT_GENERATED,
    merge: "winner",
    write: "always",
  },
  families: {
    description: "Feat family grouping (Skill Proficiency, Ability Score Improvement, etc.)",
    kind: "list",
    kindWide: true,
    label: "Families",
    field: FEAT_FAMILY,
    merge: "union",
    values: FEAT_FAMILIES,
  },
} as const;

/** While an item is of a type a template can be of: a weapon, an armor or a Shield. */
const OF_TEMPLATE_TYPE = { field: ITEM_TYPE, values: TEMPLATE_ITEM_TYPES } as const;

/**
 * An item's fields, as stored: its cost and weight (each to the hundredth, none below 0), its type (a template's one a
 * template can be of), and its slot (`"Other"` for none), or, for a type a template can be of, its template (its
 * `madeFrom` link, whose type sets its slot), which its form shows beside its name, and whether it's a template, which
 * its page gives its form; then its weapon's, armor's or Shield's statistics, each none (or empty) without its row, a
 * flag telling a `"false"` row from none (`absent: null`); then, for a magic item, its rarity, whether it takes
 * attunement, and its charges. An item made from a template reads each of them but its type, slot and template flag
 * off its template when it holds none (`inherits`, its `madeFrom` link).
 */
const ITEM_FIELDS = {
  cost: {
    description: "What it costs, in gold pieces",
    kind: "number",
    label: "Cost",
    min: 0,
    placement: "beside-name",
    scale: 2,
    unit: "gp",
    field: ITEM_COST_GP,
    inherits: "madeFrom",
    merge: "winner",
  },
  weight: {
    description: "What it weighs, in pounds",
    kind: "number",
    label: "Weight",
    min: 0,
    placement: "beside-name",
    scale: 2,
    unit: "lbs",
    field: ITEM_WEIGHT,
    inherits: "madeFrom",
    merge: "winner",
  },
  type: {
    description: "What kind of item it is",
    kind: "text",
    label: "Item Type",
    narrowed: {
      description: "What kind of item its copies are",
      required: true,
      shownWhen: [AS_TEMPLATE],
      values: TEMPLATE_ITEM_TYPES,
    },
    placement: "beside-name",
    shownWhen: [{ ...AS_TEMPLATE, except: true }],
    field: ITEM_TYPE,
    merge: "winner",
    values: ITEM_TYPES,
  },
  slot: {
    default: "Other",
    description: "Where it's worn or held",
    kind: "text",
    label: "Slot",
    placement: "beside-name",
    shownWhen: [{ ...OF_TEMPLATE_TYPE, except: true }],
    field: ITEM_SLOT,
    merge: "winner",
    values: LOCATION_OPTIONS,
    write: "always",
  },
  madeFrom: {
    description: "The template of its type it's made from, whose fields it starts from",
    kind: "ref",
    label: "Template",
    placement: "beside-name",
    references: "items",
    role: "madeFrom",
    shownWhen: [OF_TEMPLATE_TYPE, { ...AS_TEMPLATE, except: true }],
    typeField: ITEM_TYPE,
  },
  template: {
    description: "Whether it's a template others are made from",
    form: "unshown",
    kind: "flag",
    label: "Template",
    field: ITEM_IS_TEMPLATE,
    merge: "winner",
    write: "always",
  },
  weapon: {
    fields: {
      type: {
        description: "The weapon it is, for feat and modifier targeting (e.g. Longsword, Shortbow)",
        kind: "text",
        kindWide: true,
        label: "Base Weapon",
        field: WEAPON_TYPE,
        inherits: "madeFrom",
        merge: "fallback",
        values: WEAPON_NAMES,
      },
      category: {
        description: "Its category, which a weapon proficiency is by (Simple, Martial)",
        kind: "text",
        kindWide: true,
        label: "Category",
        field: WEAPON_CATEGORY,
        inherits: "madeFrom",
        merge: "fallback",
        values: WEAPON_CATEGORIES,
      },
      damage: {
        description: "Its damage dice",
        kind: "text",
        kindWide: true,
        label: "Damage",
        placeholder: 'e.g., "1d8"',
        field: WEAPON_DAMAGE,
        inherits: "madeFrom",
        merge: "fallback",
      },
      damageType: {
        description: "The type of damage it deals",
        kind: "text",
        kindWide: true,
        label: "Damage Type",
        field: WEAPON_DAMAGE_TYPE,
        inherits: "madeFrom",
        merge: "fallback",
        values: DAMAGE_TYPES,
      },
      properties: {
        description: "Its properties (Finesse, Light, Thrown, Versatile…)",
        kind: "list",
        kindWide: true,
        label: "Properties",
        field: WEAPON_PROPERTIES,
        inherits: "madeFrom",
        merge: "union",
        values: WEAPON_PROPERTY_NAMES,
      },
      versatileDamage: {
        description: "Its damage dice in two hands, a Versatile weapon's",
        kind: "text",
        kindWide: true,
        label: "Versatile Damage",
        placeholder: 'e.g., "1d10"',
        field: WEAPON_VERSATILE_DAMAGE,
        inherits: "madeFrom",
        merge: "fallback",
      },
      ranged: {
        absent: null,
        description: "Whether it's a ranged weapon: its attacks use Dexterity",
        kind: "flag",
        kindWide: true,
        label: "Ranged",
        field: WEAPON_RANGED,
        inherits: "madeFrom",
        merge: "fallback",
      },
      range: {
        description: "Its normal range in feet: a ranged weapon's, or a thrown weapon's (0 or absent = none)",
        kind: "number",
        kindWide: true,
        label: "Range (ft.)",
        field: WEAPON_RANGE,
        inherits: "madeFrom",
        merge: "fallback",
      },
      longRange: {
        description: "Its long range in feet, which it attacks at with Disadvantage",
        kind: "number",
        kindWide: true,
        label: "Long Range (ft.)",
        field: WEAPON_LONG_RANGE,
        inherits: "madeFrom",
        merge: "fallback",
      },
      mastery: {
        description: "Its mastery property, which a character with Weapon Mastery uses with it",
        kind: "text",
        kindWide: true,
        label: "Mastery",
        field: WEAPON_MASTERY,
        inherits: "madeFrom",
        merge: "fallback",
        values: MASTERY_PROPERTIES,
      },
    },
    kind: "group",
    label: "Weapon",
    shownWhen: [{ field: ITEM_TYPE, values: ["Weapon"] }],
  },
  armor: {
    fields: {
      type: {
        description: "The armor it is, for feat and modifier targeting (e.g. Leather Armor, Plate Armor)",
        kind: "text",
        kindWide: true,
        label: "Base Armor",
        field: ARMOR_TYPE,
        inherits: "madeFrom",
        merge: "fallback",
        values: ARMOR_NAMES,
      },
      category: {
        description: "Its category, which armor training is by (Light, Medium, Heavy)",
        kind: "text",
        kindWide: true,
        label: "Category",
        field: ARMOR_CATEGORY,
        inherits: "madeFrom",
        merge: "fallback",
        values: ARMOR_CATEGORIES,
      },
      armorClass: {
        description: "Its wearer's base Armor Class, before its Dexterity modifier",
        kind: "number",
        kindWide: true,
        label: "Armor Class",
        field: ARMOR_CLASS,
        inherits: "madeFrom",
        merge: "fallback",
      },
      maxDex: {
        description: "The most Dexterity modifier its wearer adds (absent = all of it, light armor's; 0 = none)",
        kind: "number",
        kindWide: true,
        label: "Max Dex Modifier",
        field: ARMOR_MAX_DEX,
        inherits: "madeFrom",
        merge: "fallback",
      },
      strength: {
        description: "The Strength score its wearer needs, or its speed is 10 feet lower",
        kind: "number",
        kindWide: true,
        label: "Strength",
        field: ARMOR_STRENGTH,
        inherits: "madeFrom",
        merge: "fallback",
      },
      stealthDisadvantage: {
        absent: null,
        description: "Whether its wearer has Disadvantage on Dexterity (Stealth) checks",
        kind: "flag",
        kindWide: true,
        label: "Stealth Disadvantage",
        field: ARMOR_STEALTH_DISADVANTAGE,
        inherits: "madeFrom",
        merge: "fallback",
      },
    },
    kind: "group",
    label: "Armor",
    shownWhen: [{ field: ITEM_TYPE, values: ["Armor"] }],
  },
  shield: {
    fields: {
      acBonus: {
        description: "What it adds to its wielder's Armor Class",
        kind: "number",
        kindWide: true,
        label: "Armor Class Bonus",
        field: SHIELD_AC_BONUS,
        inherits: "madeFrom",
        merge: "fallback",
      },
    },
    kind: "group",
    label: "Shield",
    shownWhen: [{ field: ITEM_TYPE, values: ["Shield"] }],
  },
  rarity: {
    description: "A magic item's rarity",
    kind: "text",
    kindWide: true,
    label: "Rarity",
    field: ITEM_RARITY,
    inherits: "madeFrom",
    merge: "fallback",
    values: ITEM_RARITIES,
  },
  attunement: {
    absent: null,
    description: "Whether a magic item takes attunement to use",
    kind: "flag",
    kindWide: true,
    label: "Requires Attunement",
    field: ITEM_ATTUNEMENT,
    inherits: "madeFrom",
    merge: "fallback",
  },
  charges: {
    description: "The charges it comes with (a wand's)",
    kind: "number",
    kindWide: true,
    label: "Charges",
    field: ITEM_CHARGES,
    inherits: "madeFrom",
    merge: "fallback",
  },
} as const;

/** A language's fields: its type, Standard or Rare, which its form shows beside its name. */
const LANGUAGE_FIELDS = {
  type: {
    description: "What kind of language it is: Standard, which a new character picks, or Rare",
    kind: "text",
    label: "Type",
    placeholder: "e.g., Standard, Rare",
    placement: "beside-name",
    field: LANGUAGE_TYPE,
    merge: "winner",
  },
} as const;

/** A ruleset's own fields, its Settings: none past what every ruleset has. */
const RULESET_FIELDS = {} as const;

/** A save's fields: the ability its bonus comes from (its `keyAbility` link), which its form shows beside its name. */
const SAVE_FIELDS = {
  keyAbility: {
    description: "The ability its bonus comes from",
    kind: "ref",
    label: "Linked Ability",
    placement: "beside-name",
    references: "abilities",
    required: true,
    role: "keyAbility",
  },
} as const;

/** A skill's fields: the ability its checks add (its `keyAbility` link, beside its name). */
const SKILL_FIELDS = {
  keyAbility: {
    description: "The ability its checks add",
    kind: "ref",
    label: "Ability",
    placement: "beside-name",
    references: "abilities",
    required: true,
    role: "keyAbility",
  },
} as const;

/**
 * A species' fields: its members' size and speed (Medium and 30 feet for a new species whose form gives none), which
 * its form shows beside its name.
 */
const SPECIES_FIELDS = {
  size: {
    default: "Medium",
    description: "Its members' size",
    kind: "text",
    label: "Size",
    placement: "beside-name",
    required: true,
    field: SPECIES_SIZE,
    merge: "winner",
    values: SIZE_OPTIONS,
    write: "always",
  },
  speed: {
    default: 30,
    description: "How far its members move on their turn, in feet",
    kind: "number",
    label: "Speed",
    min: 1,
    placement: "beside-name",
    unit: "feet",
    field: SPECIES_SPEED,
    merge: "winner",
    write: "always",
  },
} as const;

/**
 * A spell's fields: its spell lists, each at its spell level (its `listedIn` links, a new one needs one), then, in the
 * order a stat block shows them, its school, casting time, range, components and duration, whether it's a ritual or
 * takes concentration, and the save it calls for (its `resistedBy` link), which its form shows beside its name.
 */
const SPELL_FIELDS = {
  listedIn: {
    description: "The spell lists it's on, each at its spell level",
    entries: "tier",
    kind: "links",
    label: "Aptitudes",
    max: MAX_SPELL_LEVEL,
    min: 0,
    references: "aptitudes",
    required: APTITUDES_REQUIRED,
    role: "listedIn",
  },
  school: {
    description: "Its school of magic (Abjuration, Evocation, etc.)",
    keepsForm: true,
    kind: "text",
    kindWide: true,
    label: "School",
    field: SPELL_SCHOOL,
    merge: "fallback",
    values: SPELL_SCHOOLS,
  },
  castingTime: {
    description: 'What casting it takes (e.g., "Action", "Bonus Action", "1 minute")',
    kind: "text",
    kindWide: true,
    label: "Casting Time",
    placeholder: 'e.g., "Action"',
    field: SPELL_CASTING_TIME,
    merge: "fallback",
  },
  range: {
    description: 'Its range, as its book writes it (e.g., "Self", "Touch", "150 feet")',
    kind: "text",
    kindWide: true,
    label: "Range",
    placeholder: 'e.g., "150 feet"',
    field: SPELL_RANGE,
    merge: "fallback",
  },
  components: {
    description: "Its components (Verbal, Somatic, Material)",
    kind: "list",
    kindWide: true,
    label: "Components",
    field: SPELL_COMPONENT,
    merge: "union",
    values: SPELL_COMPONENTS,
  },
  material: {
    description: "What its Material component is",
    kind: "text",
    kindWide: true,
    label: "Material",
    placeholder: 'e.g., "a ball of bat guano and sulfur"',
    field: SPELL_MATERIAL,
    merge: "fallback",
  },
  duration: {
    description: 'How long it lasts (e.g., "Instantaneous", "Up to 1 minute")',
    kind: "text",
    kindWide: true,
    label: "Duration",
    placeholder: 'e.g., "Instantaneous"',
    field: SPELL_DURATION,
    merge: "fallback",
  },
  ritual: {
    absent: null,
    description: "Whether it can be cast as a ritual",
    kind: "flag",
    kindWide: true,
    label: "Ritual",
    field: SPELL_RITUAL,
    merge: "fallback",
  },
  concentration: {
    absent: null,
    description: "Whether it takes concentration to keep",
    kind: "flag",
    kindWide: true,
    label: "Concentration",
    field: SPELL_CONCENTRATION,
    merge: "fallback",
  },
  resistedBy: {
    description: "The saving throw it calls for",
    kind: "ref",
    label: "Saving Throw",
    placement: "beside-name",
    references: "saves",
    role: "resistedBy",
  },
} as const;

/**
 * Each entity type's fields, and a ruleset's Settings' (`rulesets`), by name, in the order its stat block shows them
 * (and its form its fields): the one declaration of each, which the engine's codecs and its storage are built from.
 */
export const ENTITY_FIELDS = {
  feats: FEAT_FIELDS,
  items: ITEM_FIELDS,
  classes: CLASS_FIELDS,
  "class-levels": CLASS_LEVEL_FIELDS,
  spells: SPELL_FIELDS,
  species: SPECIES_FIELDS,
  backgrounds: BACKGROUND_FIELDS,
  languages: LANGUAGE_FIELDS,
  rulesets: RULESET_FIELDS,
  saves: SAVE_FIELDS,
  skills: SKILL_FIELDS,
} as const;
