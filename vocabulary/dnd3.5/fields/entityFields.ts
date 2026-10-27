/**
 * The D&D 3.5 entities' fields: each entity type's, and a ruleset's Settings', in the order a stat block shows them
 * (and its form its fields), each declared once, as data the engine stores, reads and takes from a form by (its kind's
 * codec, `FieldCodec`, and its storage, `Engine.storage()`; `FieldSpec` is a declaration's shape): its name, the stored
 * field that keeps it (a link's, the role of its owner's links: a reference's single link, a list of links its form
 * edits), its label and what it's for, its kind, its closed list of values or the entity its value names, its default,
 * scale and bounds, whether a form must give it (`required`), how sibling copies merge it, the role its entity reads it
 * off another through (an item's, its template's), when it counts (`when`), and how its form shows it: where
 * (`placement`, `shownIn`), on what (`shownWhen`), in its unit, by its values' labels, or not at all (`form`). A field
 * merges by what its value is:
 * - a set (a list, a progression) holds every copy's values (`union`);
 * - a value that reads apart from the others falls back to a sibling's when the winning copy holds none (`fallback`);
 * - a value its entity is read by, with its others, is the winning copy's alone (`winner`), so no stat line mixes two
 *   copies' readings: a class's hit die, a feat's flags, an item's type, slot, cost and weight and whether it's a
 *   template, a language's type, a race's size and speed, a spell's save effect (beside its save, its `resistedBy`
 *   link, which merges so too); and a ruleset's Settings, which are the nearest ruleset's of its chain, whole.
 *
 * A field whose values name groupings across its kind (`kindWide`: a weapon's type, a feat's family, a spell's school)
 * is read kind-wide, as the target paths label them: an item's, a feat's and a spell's but those its rules set or its
 * form shows beside its name (an item's type, slot, cost, weight and template flag, a feat's flags, a spell's save
 * effect).
 */

import {
  ARMOR_PROFICIENCIES,
  ARMOR_TYPE_NAMES,
  SHIELD_PROFICIENCIES,
  SHIELD_TYPE_NAMES,
} from "@/vocabulary/dnd3.5/armor.ts";
import {
  ABILITY_INCREASE_LEVEL_INTERVAL,
  CASTER_TYPES,
  DEFAULT_HIT_DIE,
  FIRST_LEVEL_GENERAL_FEATS,
  GENERAL_FEAT_LEVEL_INTERVAL,
  HIT_DIE_LABELS,
  HIT_DIE_VALUES,
  MAX_CHARACTER_LEVEL,
  MAX_CLASS_LEVEL,
  MAX_GENERAL_FEATS_PER_LEVEL,
  MAX_SAVE_BASE,
  MAX_TABLE_COUNT,
} from "@/vocabulary/dnd3.5/classes.ts";
import { LOCATION_OPTIONS } from "@/vocabulary/dnd3.5/equipment.ts";
import { FEAT_FAMILIES } from "@/vocabulary/dnd3.5/feats.ts";
import { ITEM_TYPES, TEMPLATE_ITEM_TYPES } from "@/vocabulary/dnd3.5/itemTemplates.ts";
import { SIZE_OPTIONS } from "@/vocabulary/dnd3.5/sizes.ts";
import {
  MAX_SPELL_LEVEL,
  SPELL_COMPONENTS,
  SPELL_DESCRIPTORS,
  SPELL_SCHOOLS,
  SPELL_SUBSCHOOLS,
} from "@/vocabulary/dnd3.5/spells.ts";
import {
  DAMAGE_TYPES,
  STRENGTH_DAMAGE_RULES,
  WEAPON_FAMILIES,
  WEAPON_PROFICIENCIES,
  WEAPON_TYPE_NAMES,
} from "@/vocabulary/dnd3.5/weapons.ts";

import { ARMOR_AC_BONUS, ARMOR_CHECK_PENALTY, ARMOR_MAX_DEX, ARMOR_PROFICIENCY, ARMOR_TYPE } from "./armor.ts";
import { CLASS_CASTER_TYPE, CLASS_HD } from "./class.ts";
import { CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_POINTS } from "./classLevel.ts";
import {
  FEAT_FAMILY,
  FEAT_GENERATED,
  FEAT_OVERSIZED_TWO_WEAPON_FIGHTING,
  FEAT_SELECTABLE,
  FEAT_STACKABLE,
  FEAT_WEAPON_FINESSE,
  WIZARD_PROHIBITED_SCHOOL,
} from "./feat.ts";
import {
  DAMAGE_TYPE,
  ITEM_COST_GP,
  ITEM_HAS_CHARGES,
  ITEM_IS_TEMPLATE,
  ITEM_MADE_OF,
  ITEM_MASTERWORK,
  ITEM_SLOT,
  ITEM_SPELL_FAILURE,
  ITEM_TYPE,
  ITEM_WEIGHT,
  MAGIC_AURA,
  MAGIC_CASTER_LEVEL,
} from "./item.ts";
import { LANGUAGE_TYPE } from "./language.ts";
import { RACE_BASE_SPEED, RACE_QUADRUPED, RACE_SIZE, RACE_SPEED_IGNORES_ENCUMBRANCE } from "./race.ts";
import { RULESET_ABILITY_INCREASES, RULESET_FEAT_ADVANCEMENT } from "./ruleset.ts";
import { SHIELD_AC_BONUS, SHIELD_PROFICIENCY, SHIELD_TYPE } from "./shield.ts";
import { SKILL_CHECK_PENALTY_MULTIPLIER, SKILL_IMPACTED_BY_WEIGHT, SKILL_USABLE_WITHOUT_TRAINING } from "./skill.ts";
import {
  SPELL_AREA_OF_EFFECT,
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_DURATION,
  SPELL_EFFECT,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SAVE_EFFECT,
  SPELL_SCHOOL,
  SPELL_SUBSCHOOL,
  SPELL_TARGET,
} from "./spell.ts";
import {
  WEAPON_BASE_DAMAGE,
  WEAPON_CRITICAL_MULTIPLIER,
  WEAPON_CRITICAL_RANGE,
  WEAPON_DOUBLE_DAMAGE,
  WEAPON_FAMILY,
  WEAPON_FINESSABLE,
  WEAPON_MAX_RANGE_INCREMENTS,
  WEAPON_MIGHTY,
  WEAPON_ONE_HAND_TRAINING,
  WEAPON_ONE_HANDED_PENALTY,
  WEAPON_PROFICIENCY,
  WEAPON_RANGE,
  WEAPON_RANGED,
  WEAPON_REACH,
  WEAPON_SIZE,
  WEAPON_STRENGTH_DAMAGE,
  WEAPON_TYPE,
} from "./weapon.ts";

/** What a new feat's or spell's form says of its empty list of pools, which it refuses. */
const APTITUDES_REQUIRED = "At least one aptitude must be selected";

/** A template's form: whether it's one isn't a field its form changes. */
const AS_TEMPLATE = { field: ITEM_IS_TEMPLATE, values: [true] } as const;

/**
 * A class's fields: its hit die (one of the dice, beside its name; a new class's `DEFAULT_HIT_DIE` when its form gives
 * none), the ability its bonus spells and spell DCs come from, and its caster type.
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
  bonusSpellAbility: {
    description: "Ability score used for bonus spells per day",
    kind: "ref",
    label: "Bonus Spell Ability",
    references: "abilities",
    role: "bonusSpellAbility",
  },
  casterType: {
    description: "Whether this class casts arcane or divine spells",
    kind: "choice",
    label: "Caster Type",
    field: CLASS_CASTER_TYPE,
    merge: "fallback",
    values: CASTER_TYPES,
  },
} as const;

/**
 * A class level's fields: its base bonus to each of the ruleset's saves (its `baseBonus` links) and the feats it grants,
 * each through the pool it's taken for (its `grants` links), then its base attack bonus and its skill points, in their
 * bounds, 0 without their rows, both always written.
 */
const CLASS_LEVEL_FIELDS = {
  baseBonus: {
    description: "The base bonus the level gives each save",
    entries: "amount",
    kind: "links",
    label: "Saves",
    max: MAX_SAVE_BASE,
    min: 0,
    references: "saves",
    role: "baseBonus",
  },
  grants: {
    description: "Select feats with aptitudes granted at this level",
    entries: "grant",
    kind: "links",
    label: "Feats",
    references: "feats",
    role: "grants",
    via: "aptitudes",
  },
  bab: {
    default: 0,
    description: "Base attack bonus at this class level",
    kind: "number",
    label: "Base Attack Bonus",
    // A full base attack bonus's at the last level: one never outruns its level
    max: MAX_CLASS_LEVEL,
    min: 0,
    field: CLASS_LEVEL_BAB,
    merge: "fallback",
    write: "always",
  },
  skills: {
    default: 0,
    description: "Skill points gained per level",
    kind: "number",
    label: "Skill Points",
    max: MAX_TABLE_COUNT,
    min: 0,
    field: CLASS_LEVEL_SKILL_POINTS,
    merge: "fallback",
    write: "always",
  },
} as const;

/**
 * A feat's fields: the pools it's picked in (its `listedIn` links beside its name, a new one needs one), whether a
 * character takes it more than once, whether a level up picks it, whether its ruleset made it (each always written,
 * which its rules set: no form shows them), the families it's in (a feat can be in two), the weapon rules it changes,
 * and the schools it forbids (a specialist wizard's).
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
    description: "Whether a character can take the feat more than once",
    form: "hidden",
    kind: "flag",
    label: "Stackable",
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
    description: "Whether its ruleset generated the feat (Skill Focus in a skill)",
    form: "hidden",
    kind: "flag",
    label: "Generated",
    field: FEAT_GENERATED,
    merge: "winner",
    write: "always",
  },
  families: {
    description: "Feat family grouping (Weapon Focus, Spell Focus, etc.)",
    kind: "list",
    kindWide: true,
    label: "Families",
    field: FEAT_FAMILY,
    merge: "union",
    values: FEAT_FAMILIES,
  },
  weaponFinesse: {
    description: "Whether the feat lets its owner attack with Dexterity with a finessable weapon (Weapon Finesse)",
    kind: "flag",
    kindWide: true,
    label: "Weapon Finesse",
    field: FEAT_WEAPON_FINESSE,
    merge: "fallback",
  },
  oversizedTwoWeaponFighting: {
    description:
      "Whether the feat makes a one-handed off-hand weapon count as light in two-weapon fighting (Oversized Two-Weapon Fighting)",
    kind: "flag",
    kindWide: true,
    label: "Oversized Two-Weapon Fighting",
    field: FEAT_OVERSIZED_TWO_WEAPON_FIGHTING,
    merge: "fallback",
  },
  prohibitedSchools: {
    description: "School of magic prohibited by wizard specialization",
    kind: "list",
    kindWide: true,
    label: "Prohibited Schools",
    field: WIZARD_PROHIBITED_SCHOOL,
    merge: "union",
  },
} as const;

/** While an item is of a type a template can be of: a weapon, an armor or a shield. */
const OF_TEMPLATE_TYPE = { field: ITEM_TYPE, values: TEMPLATE_ITEM_TYPES } as const;

/** The groups of an armor's and a shield's fields, which show a stat both have among their own. */
const WORN = ["armor", "shield"] as const;

/**
 * An item's fields, as stored: its cost and weight (each to the hundredth, none below 0), its type (a template's one a
 * template can be of), and its slot (`"Other"` for none), or, for a type a template can be of, its template (its
 * `madeFrom` link, whose type sets its slot), which its form shows beside its name, and whether it's a template, which
 * its page gives its form; then its type's and its make's, each none (or empty) without its row, a flag telling a
 * `"false"` row from none (`absent: null`). An item made from a template reads each of them but its type, slot and
 * template flag off its template when it holds none (`inherits`, its `madeFrom` link). Its form shows a weapon's, an
 * armor's and a shield's fields for an item of that type, in its section: an armor's or a shield's max Dex bonus, check
 * penalty and spell failure too, which both keep alike.
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
        description: "Base weapon type for feat/modifier targeting (e.g. Longsword, Shortsword)",
        kind: "text",
        kindWide: true,
        label: "Base Weapon",
        field: WEAPON_TYPE,
        inherits: "madeFrom",
        merge: "fallback",
        values: WEAPON_TYPE_NAMES,
      },
      proficiency: {
        description: "Weapon proficiency classification (Simple, Martial, Exotic)",
        kind: "text",
        kindWide: true,
        label: "Proficiency",
        field: WEAPON_PROFICIENCY,
        inherits: "madeFrom",
        merge: "fallback",
        values: WEAPON_PROFICIENCIES,
      },
      family: {
        description: "Weapon family grouping (Sword, Axe, Bow, etc.)",
        kind: "text",
        kindWide: true,
        label: "Family",
        field: WEAPON_FAMILY,
        inherits: "madeFrom",
        merge: "fallback",
        values: WEAPON_FAMILIES,
      },
      size: {
        description:
          "The weapon's effort, as the table gives it for a Medium wielder: Tiny or Small light, Medium one-handed, Large two-handed",
        kind: "text",
        kindWide: true,
        label: "Size",
        field: WEAPON_SIZE,
        inherits: "madeFrom",
        merge: "fallback",
      },
      baseDamage: {
        description: "Base damage dice for weapons",
        kind: "text",
        kindWide: true,
        label: "Damage",
        placeholder: 'e.g., "1d8"',
        field: WEAPON_BASE_DAMAGE,
        inherits: "madeFrom",
        merge: "fallback",
      },
      doubleDamage: {
        description: "A double weapon's other end's damage dice: in two hands, it fights as two weapons",
        kind: "text",
        kindWide: true,
        label: "Other End's Damage",
        placeholder: 'e.g., "1d6"',
        field: WEAPON_DOUBLE_DAMAGE,
        inherits: "madeFrom",
        merge: "fallback",
      },
      damageTypes: {
        description: "Type of damage dealt",
        kind: "list",
        kindWide: true,
        label: "Damage Types",
        field: DAMAGE_TYPE,
        inherits: "madeFrom",
        merge: "union",
        values: DAMAGE_TYPES,
      },
      criticalRange: {
        description: "Critical threat count (1 = 20, 2 = 19-20, 3 = 18-20, etc.)",
        kind: "number",
        kindWide: true,
        label: "Critical Range",
        field: WEAPON_CRITICAL_RANGE,
        inherits: "madeFrom",
        merge: "fallback",
      },
      criticalMultiplier: {
        description: "Critical hit damage multiplier",
        kind: "number",
        kindWide: true,
        label: "Critical Multiplier",
        field: WEAPON_CRITICAL_MULTIPLIER,
        inherits: "madeFrom",
        merge: "fallback",
      },
      strengthDamage: {
        description: "Strength to damage: Slot (the hand's share; default), Rating (bows: up to Mighty), None",
        kind: "text",
        kindWide: true,
        label: "Strength to Damage",
        field: WEAPON_STRENGTH_DAMAGE,
        inherits: "madeFrom",
        merge: "fallback",
        values: STRENGTH_DAMAGE_RULES,
      },
      mighty: {
        description:
          "A composite bow's Strength rating: the most Strength bonus it adds to damage; below it, -2 to attack",
        kind: "number",
        kindWide: true,
        label: "Mighty Rating",
        field: WEAPON_MIGHTY,
        inherits: "madeFrom",
        merge: "fallback",
      },
      ranged: {
        absent: null,
        description:
          "Whether it's a ranged weapon (thrown or projectile, not used in melee): its attacks use Dexterity",
        kind: "flag",
        kindWide: true,
        label: "Ranged",
        field: WEAPON_RANGED,
        inherits: "madeFrom",
        merge: "fallback",
      },
      range: {
        description: "Range increment in feet: a ranged weapon's, or a thrown melee weapon's (0 or absent = none)",
        kind: "number",
        kindWide: true,
        label: "Range Increment (ft.)",
        field: WEAPON_RANGE,
        inherits: "madeFrom",
        merge: "fallback",
      },
      maxRangeIncrements: {
        description:
          "How many range increments it reaches: 10 for a projectile weapon (a bow, a crossbow, a sling), 1 for a net (absent = 5)",
        kind: "number",
        kindWide: true,
        label: "Range Increments",
        field: WEAPON_MAX_RANGE_INCREMENTS,
        inherits: "madeFrom",
        merge: "fallback",
      },
      reach: {
        description: "Melee reach in feet (0 or absent = 5 ft.)",
        kind: "number",
        kindWide: true,
        label: "Reach (ft.)",
        field: WEAPON_REACH,
        inherits: "madeFrom",
        merge: "fallback",
      },
      finessable: {
        absent: null,
        description: "Whether a feat with FEAT_WEAPON_FINESSE (Weapon Finesse) lets this weapon attack with Dexterity",
        kind: "flag",
        kindWide: true,
        label: "Finessable",
        field: WEAPON_FINESSABLE,
        inherits: "madeFrom",
        merge: "fallback",
      },
      oneHandTraining: {
        absent: null,
        description:
          "Whether it's too large for one hand without training (a bastard sword): there, only its proficiency lets it be used",
        kind: "flag",
        kindWide: true,
        label: "One-Hand Training",
        field: WEAPON_ONE_HAND_TRAINING,
        inherits: "madeFrom",
        merge: "fallback",
      },
      oneHandedPenalty: {
        description:
          "Penalty to attack in one hand, when it takes two to load: a crossbow's (-2 light, -4 heavy; absent = none)",
        kind: "number",
        kindWide: true,
        label: "One-Handed Penalty",
        field: WEAPON_ONE_HANDED_PENALTY,
        inherits: "madeFrom",
        merge: "fallback",
      },
    },
    kind: "group",
    label: "Weapon",
    shownWhen: [{ field: ITEM_TYPE, values: ["Weapon"] }],
  },
  armor: {
    fields: {
      type: {
        description: "Base armor type for feat/modifier targeting (e.g. Leather Armor, Full Plate)",
        kind: "text",
        kindWide: true,
        label: "Base Armor",
        field: ARMOR_TYPE,
        inherits: "madeFrom",
        merge: "fallback",
        values: ARMOR_TYPE_NAMES,
      },
      proficiency: {
        description: "Armor proficiency classification (Light, Medium, Heavy)",
        kind: "text",
        kindWide: true,
        label: "Proficiency",
        field: ARMOR_PROFICIENCY,
        inherits: "madeFrom",
        merge: "fallback",
        values: ARMOR_PROFICIENCIES,
      },
      acBonus: {
        description: "Armor class bonus from armor",
        kind: "number",
        kindWide: true,
        label: "Armor Bonus",
        field: ARMOR_AC_BONUS,
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
      type: {
        description: "Base shield type for feat/modifier targeting (e.g. Buckler, Tower Shield)",
        kind: "text",
        kindWide: true,
        label: "Base Shield",
        field: SHIELD_TYPE,
        inherits: "madeFrom",
        merge: "fallback",
        values: SHIELD_TYPE_NAMES,
      },
      proficiency: {
        description: "Shield proficiency classification (Light, Heavy, Tower)",
        kind: "text",
        kindWide: true,
        label: "Proficiency",
        field: SHIELD_PROFICIENCY,
        inherits: "madeFrom",
        merge: "fallback",
        values: SHIELD_PROFICIENCIES,
      },
      acBonus: {
        description: "Armor class bonus from shield",
        kind: "number",
        kindWide: true,
        label: "Shield Bonus",
        field: SHIELD_AC_BONUS,
        inherits: "madeFrom",
        merge: "fallback",
      },
    },
    kind: "group",
    label: "Shield",
    shownWhen: [{ field: ITEM_TYPE, values: ["Shield"] }],
  },
  /** An armor's, or a tower shield's. */
  maxDex: {
    description: "Maximum dexterity bonus allowed",
    kind: "number",
    kindWide: true,
    label: "Max Dex Bonus",
    shownIn: WORN,
    field: ARMOR_MAX_DEX,
    inherits: "madeFrom",
    merge: "fallback",
  },
  /** An armor's or a shield's. */
  checkPenalty: {
    description: "Penalty to Str/Dex-based skill checks",
    kind: "number",
    kindWide: true,
    label: "Armor Check Penalty",
    shownIn: WORN,
    field: ARMOR_CHECK_PENALTY,
    inherits: "madeFrom",
    merge: "fallback",
  },
  spellFailure: {
    description: "Arcane spell failure chance percentage",
    kind: "number",
    kindWide: true,
    label: "Arcane Spell Failure (%)",
    shownIn: WORN,
    field: ITEM_SPELL_FAILURE,
    inherits: "madeFrom",
    merge: "fallback",
  },
  masterwork: {
    absent: null,
    description: "Whether this item is masterwork quality (reduces armor check penalty by 1)",
    kind: "flag",
    kindWide: true,
    label: "Masterwork",
    field: ITEM_MASTERWORK,
    inherits: "madeFrom",
    merge: "fallback",
  },
  madeOf: {
    description: "Material composition",
    kind: "text",
    kindWide: true,
    label: "Material",
    field: ITEM_MADE_OF,
    inherits: "madeFrom",
    merge: "fallback",
    values: ["Adamantine", "Mithral", "Cold Iron", "Silver", "Darkwood"],
  },
  /** The charges it comes with, none for an item without charges. */
  charges: {
    description: "Default number of charges for this item",
    kind: "number",
    kindWide: true,
    label: "Charges",
    field: ITEM_HAS_CHARGES,
    inherits: "madeFrom",
    merge: "fallback",
  },
  magicCasterLevel: {
    description: "Caster level required to create this magic item",
    kind: "number",
    kindWide: true,
    label: "Caster Level",
    field: MAGIC_CASTER_LEVEL,
    inherits: "madeFrom",
    merge: "fallback",
  },
  magicAuras: {
    description: "Magic aura strength and school (e.g. Moderate transmutation)",
    kind: "list",
    kindWide: true,
    label: "Auras",
    field: MAGIC_AURA,
    inherits: "madeFrom",
    merge: "union",
  },
} as const;

/** A language's fields: its type, which its form shows beside its name. */
const LANGUAGE_FIELDS = {
  type: {
    description: "What kind of language it is (spoken, written, secret)",
    kind: "text",
    label: "Type",
    placeholder: "e.g., Spoken, Written, Sign, Secret",
    placement: "beside-name",
    field: LANGUAGE_TYPE,
    merge: "winner",
  },
} as const;

/**
 * A race's fields: its members' size and base speed (Medium and 30 feet for a new race whose form gives none), which
 * its form shows beside its name, whether armor and load leave its speed, and whether it walks on four legs.
 */
const RACE_FIELDS = {
  size: {
    default: "Medium",
    description: "Its members' size",
    kind: "text",
    label: "Size",
    placement: "beside-name",
    required: true,
    field: RACE_SIZE,
    merge: "winner",
    values: SIZE_OPTIONS,
    write: "always",
  },
  baseSpeed: {
    default: 30,
    description: "How far its members move a round, in feet",
    kind: "number",
    label: "Base Speed",
    min: 1,
    placement: "beside-name",
    unit: "feet",
    field: RACE_BASE_SPEED,
    merge: "winner",
    write: "always",
  },
  speedIgnoresEncumbrance: {
    description:
      "Whether the race keeps its speed in medium or heavy armor and under a medium or heavy load (the dwarf)",
    kind: "flag",
    label: "Speed Ignores Encumbrance",
    field: RACE_SPEED_IGNORES_ENCUMBRANCE,
    merge: "fallback",
  },
  quadruped: {
    description: "Whether the race walks on four legs, which carries more: x1 1/2 when Medium, x3 when Large (SRD)",
    kind: "flag",
    label: "Quadruped",
    field: RACE_QUADRUPED,
    merge: "fallback",
  },
} as const;

/**
 * A ruleset's own fields, its Settings: the ability its characters' skill points come from, which a ruleset always
 * names, and its progression, which every character follows whatever its classes: the feats its levels give it to
 * pick, and the ability increases they give, each a frequency and more at the levels it names, the core rules'
 * without a row.
 */
const RULESET_FIELDS = {
  skillPointAbility: {
    description: "The ability whose modifier a character adds to the skill points each of its levels gives",
    kind: "ref",
    label: "Skill Point Ability",
    references: "abilities",
    required: true,
    role: "skillPointAbility",
  },
  featAdvancement: {
    default: { every: GENERAL_FEAT_LEVEL_INTERVAL, extra: [{ amount: FIRST_LEVEL_GENERAL_FEATS, level: 1 }] },
    description:
      "The feats a character's levels give it to pick, whatever its classes, besides its classes' bonus feats: one every so many levels, and more at the levels listed (the core rules: one every 3 levels, and one more at level 1)",
    kind: "progression",
    label: "Feat Advancement",
    levels: MAX_CHARACTER_LEVEL,
    max: MAX_GENERAL_FEATS_PER_LEVEL,
    field: RULESET_FEAT_ADVANCEMENT,
    merge: "winner",
  },
  abilityIncreases: {
    default: { every: ABILITY_INCREASE_LEVEL_INTERVAL, extra: [] },
    description:
      "The character levels that raise one of a character's ability scores by 1, whatever its classes: one every so many levels, and at the levels listed, one at most a level (the core rules: one every 4 levels)",
    kind: "progression",
    label: "Ability Score Increases",
    levels: MAX_CHARACTER_LEVEL,
    // One at most: a level's increase raises one ability, which the level-up wizard picks
    max: 1,
    field: RULESET_ABILITY_INCREASES,
    merge: "winner",
  },
} as const;

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

/**
 * A skill's fields: the ability its checks add (its `keyAbility` link, beside its name), whether armor weighs on it,
 * how many times over, and whether it's usable untrained. Without their rows, armor doesn't weigh on it and it needs
 * training. The multiplier only counts on a skill armor weighs on: any other keeps 1.
 */
const SKILL_FIELDS = {
  keyAbility: {
    description: "The ability its checks add",
    kind: "ref",
    label: "Primary Ability",
    placement: "beside-name",
    references: "abilities",
    required: true,
    role: "keyAbility",
  },
  impactedByWeight: {
    description: "Whether the skill is impacted by armor check penalty",
    kind: "flag",
    label: "Impacted by Weight",
    field: SKILL_IMPACTED_BY_WEIGHT,
    merge: "fallback",
  },
  checkPenaltyMultiplier: {
    default: 1,
    description: "How many times over the skill takes the armor check penalty (2 for Swim)",
    kind: "number",
    label: "Armor Check Penalty Multiplier",
    min: 1,
    field: SKILL_CHECK_PENALTY_MULTIPLIER,
    merge: "fallback",
    when: { field: "impactedByWeight", values: [true] },
  },
  usableWithoutTraining: {
    description: "Whether the skill can be used without training",
    kind: "flag",
    label: "Usable Without Training",
    field: SKILL_USABLE_WITHOUT_TRAINING,
    merge: "fallback",
  },
} as const;

/**
 * A spell's fields: its spell lists, each at its spell level (its `listedIn` links, a new one needs one), then, in the
 * order a 3.5 stat block shows them, its school, components, range…, and the save it allows (its `resistedBy` link)
 * and what a successful save does, which its form shows beside its name.
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
    description: "Spell school (Abjuration, Conjuration, etc.)",
    keepsForm: true,
    kind: "text",
    kindWide: true,
    label: "School",
    field: SPELL_SCHOOL,
    merge: "fallback",
    values: SPELL_SCHOOLS,
  },
  subschool: {
    description: "Spell subschool (Calling, Charm, Creation, etc.)",
    kind: "text",
    kindWide: true,
    label: "Subschool",
    field: SPELL_SUBSCHOOL,
    merge: "fallback",
    values: SPELL_SUBSCHOOLS,
  },
  descriptors: {
    description: "Spell descriptor (Fire, Cold, Mind-Affecting, etc.)",
    kind: "list",
    kindWide: true,
    label: "Descriptors",
    field: SPELL_DESCRIPTOR,
    merge: "union",
    values: SPELL_DESCRIPTORS,
  },
  components: {
    description: "Required component (Verbal, Somatic, Material, Focus, Divine Focus, XP Cost)",
    kind: "list",
    kindWide: true,
    label: "Components",
    field: SPELL_COMPONENT,
    merge: "union",
    values: SPELL_COMPONENTS,
  },
  castingTime: {
    description: 'Time to cast (e.g., "1 standard action", "1 round")',
    kind: "text",
    kindWide: true,
    label: "Casting Time",
    placeholder: 'e.g., "1 standard action"',
    field: SPELL_CASTING_TIME,
    merge: "fallback",
  },
  rangeType: {
    description: 'Range, as its book writes it (e.g., "Touch", "Close (25 ft. + 5 ft./2 levels)", "60 ft.")',
    kind: "text",
    kindWide: true,
    label: "Range",
    placeholder: 'e.g., "Close (25 ft. + 5 ft./2 levels)"',
    field: SPELL_RANGE_TYPE,
    merge: "fallback",
  },
  target: {
    description: 'Valid targets (e.g., "One creature", "You")',
    kind: "text",
    kindWide: true,
    label: "Target",
    placeholder: 'e.g., "One creature"',
    field: SPELL_TARGET,
    merge: "fallback",
  },
  effect: {
    description: 'What the spell brings into being (e.g., "One summoned creature", "Ray")',
    kind: "text",
    kindWide: true,
    label: "Effect",
    placeholder: 'e.g., "One summoned creature"',
    field: SPELL_EFFECT,
    merge: "fallback",
  },
  areaOfEffect: {
    description: 'Area of effect (e.g., "20-ft. radius", "Cone")',
    kind: "text",
    kindWide: true,
    label: "Area of Effect",
    placeholder: 'e.g., "20-ft. radius"',
    field: SPELL_AREA_OF_EFFECT,
    merge: "fallback",
  },
  duration: {
    description: 'Duration description (e.g., "1 round/level", "Instantaneous")',
    kind: "text",
    kindWide: true,
    label: "Duration",
    placeholder: 'e.g., "1 round/level"',
    field: SPELL_DURATION,
    merge: "fallback",
  },
  spellResistance: {
    description: 'Whether spell resistance applies, as its book writes it (e.g., "Yes", "No", "Yes (harmless)")',
    kind: "text",
    kindWide: true,
    label: "Spell Resistance",
    placeholder: 'e.g., "Yes (harmless)"',
    field: SPELL_RESISTANCE,
    merge: "fallback",
  },
  resistedBy: {
    description: "The save it allows",
    kind: "ref",
    label: "Saving Throw",
    placement: "beside-name",
    references: "saves",
    role: "resistedBy",
  },
  saveEffect: {
    description: "What a successful save does",
    kind: "text",
    label: "Save Effect",
    placeholder: 'e.g., "negates", "half", "partial"',
    placement: "beside-name",
    field: SPELL_SAVE_EFFECT,
    merge: "winner",
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
  races: RACE_FIELDS,
  languages: LANGUAGE_FIELDS,
  rulesets: RULESET_FIELDS,
  saves: SAVE_FIELDS,
  skills: SKILL_FIELDS,
} as const;
