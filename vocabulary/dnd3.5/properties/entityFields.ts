/**
 * The D&D 3.5 entities' fields: each entity type's, in the order a stat block shows them (and its form its fields),
 * each declared once, as data the engine builds its kind's codec from (`FieldCodec`, `engine/core/fields/`, whose
 * `FieldSpec` is a declaration's shape): its name, the stored field that keeps it (a reference's link role too), its
 * label and what it's for, its kind, its closed list of values or the entity its value names, its default and bounds,
 * when it counts (`when`) and where its form shows it (`shownIn`). The engine reads them through the 3.5 module's
 * fields too: the order a ruleset's view keeps every entity's values in (`DeclaredFields`).
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
  FIRST_LEVEL_GENERAL_FEATS,
  GENERAL_FEAT_LEVEL_INTERVAL,
  MAX_CHARACTER_LEVEL,
  MAX_CLASS_LEVEL,
  MAX_GENERAL_FEATS_PER_LEVEL,
  MAX_TABLE_COUNT,
} from "@/vocabulary/dnd3.5/classes.ts";
import { FEAT_FAMILIES } from "@/vocabulary/dnd3.5/feats.ts";
import { SPELL_COMPONENTS, SPELL_DESCRIPTORS, SPELL_SCHOOLS, SPELL_SUBSCHOOLS } from "@/vocabulary/dnd3.5/spells.ts";
import {
  DAMAGE_TYPES,
  STRENGTH_DAMAGE_RULES,
  WEAPON_FAMILIES,
  WEAPON_PROFICIENCIES,
  WEAPON_TYPE_NAMES,
} from "@/vocabulary/dnd3.5/weapons.ts";

import { ARMOR_AC_BONUS, ARMOR_CHECK_PENALTY, ARMOR_MAX_DEX, ARMOR_PROFICIENCY, ARMOR_TYPE } from "./armor.ts";
import {
  FEAT_FAMILY,
  FEAT_OVERSIZED_TWO_WEAPON_FIGHTING,
  FEAT_WEAPON_FINESSE,
  WIZARD_PROHIBITED_SCHOOL,
} from "./feat.ts";
import {
  DAMAGE_TYPE,
  ITEM_HAS_CHARGES,
  ITEM_MADE_OF,
  ITEM_MASTERWORK,
  ITEM_SPELL_FAILURE,
  MAGIC_AURA,
  MAGIC_CASTER_LEVEL,
} from "./item.ts";
import { CLASS_BONUS_SPELL_ABILITY_ID, CLASS_CASTER_TYPE } from "./klass.ts";
import { CLASS_LEVEL_BAB, CLASS_LEVEL_SKILL_POINTS } from "./klassLevel.ts";
import { RACE_QUADRUPED, RACE_SPEED_IGNORES_ENCUMBRANCE } from "./race.ts";
import { RULESET_ABILITY_INCREASES, RULESET_FEAT_ADVANCEMENT, RULESET_SKILL_POINT_ABILITY_ID } from "./ruleset.ts";
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

/**
 * A feat's fields: the families it's in (a feat can be in two), the weapon rules it changes, and the schools it forbids
 * (a specialist wizard's).
 */
const FEAT_FIELDS = {
  families: {
    description: "Feat family grouping (Weapon Focus, Spell Focus, etc.)",
    kind: "list",
    label: "Families",
    field: FEAT_FAMILY,
    values: FEAT_FAMILIES,
  },
  weaponFinesse: {
    description: "Whether the feat lets its owner attack with Dexterity with a finessable weapon (Weapon Finesse)",
    kind: "flag",
    label: "Weapon Finesse",
    field: FEAT_WEAPON_FINESSE,
  },
  oversizedTwoWeaponFighting: {
    description:
      "Whether the feat makes a one-handed off-hand weapon count as light in two-weapon fighting (Oversized Two-Weapon Fighting)",
    kind: "flag",
    label: "Oversized Two-Weapon Fighting",
    field: FEAT_OVERSIZED_TWO_WEAPON_FIGHTING,
  },
  prohibitedSchools: {
    description: "School of magic prohibited by wizard specialization",
    kind: "list",
    label: "Prohibited Schools",
    field: WIZARD_PROHIBITED_SCHOOL,
  },
} as const;

/** The groups of an armor's and a shield's fields, which show a stat both have among their own. */
const WORN = ["armor", "shield"] as const;

/**
 * An item's fields, as stored: each none (or empty) without its row, a flag telling a `"false"` row from none
 * (`absent: null`). Its form shows a weapon's, an armor's and a shield's fields for an item of that type, in its
 * section: an armor's or a shield's max Dex bonus, check penalty and spell failure too, which both keep alike.
 */
const ITEM_FIELDS = {
  weapon: {
    fields: {
      type: {
        description: "Base weapon type for feat/modifier targeting (e.g. Longsword, Shortsword)",
        kind: "text",
        label: "Base Weapon",
        field: WEAPON_TYPE,
        values: WEAPON_TYPE_NAMES,
      },
      proficiency: {
        description: "Weapon proficiency classification (Simple, Martial, Exotic)",
        kind: "text",
        label: "Proficiency",
        field: WEAPON_PROFICIENCY,
        values: WEAPON_PROFICIENCIES,
      },
      family: {
        description: "Weapon family grouping (Sword, Axe, Bow, etc.)",
        kind: "text",
        label: "Family",
        field: WEAPON_FAMILY,
        values: WEAPON_FAMILIES,
      },
      size: {
        description:
          "The weapon's effort, as the table gives it for a Medium wielder: Tiny or Small light, Medium one-handed, Large two-handed",
        kind: "text",
        label: "Size",
        field: WEAPON_SIZE,
      },
      baseDamage: {
        description: "Base damage dice for weapons",
        kind: "text",
        label: "Damage",
        placeholder: 'e.g., "1d8"',
        field: WEAPON_BASE_DAMAGE,
      },
      doubleDamage: {
        description: "A double weapon's other end's damage dice: in two hands, it fights as two weapons",
        kind: "text",
        label: "Other End's Damage",
        placeholder: 'e.g., "1d6"',
        field: WEAPON_DOUBLE_DAMAGE,
      },
      damageTypes: {
        description: "Type of damage dealt",
        kind: "list",
        label: "Damage Types",
        field: DAMAGE_TYPE,
        values: DAMAGE_TYPES,
      },
      criticalRange: {
        description: "Critical threat count (1 = 20, 2 = 19-20, 3 = 18-20, etc.)",
        kind: "number",
        label: "Critical Range",
        field: WEAPON_CRITICAL_RANGE,
      },
      criticalMultiplier: {
        description: "Critical hit damage multiplier",
        kind: "number",
        label: "Critical Multiplier",
        field: WEAPON_CRITICAL_MULTIPLIER,
      },
      strengthDamage: {
        description: "Strength to damage: Slot (the hand's share; default), Rating (bows: up to Mighty), None",
        kind: "text",
        label: "Strength to Damage",
        field: WEAPON_STRENGTH_DAMAGE,
        values: STRENGTH_DAMAGE_RULES,
      },
      mighty: {
        description:
          "A composite bow's Strength rating: the most Strength bonus it adds to damage; below it, -2 to attack",
        kind: "number",
        label: "Mighty Rating",
        field: WEAPON_MIGHTY,
      },
      ranged: {
        absent: null,
        description:
          "Whether it's a ranged weapon (thrown or projectile, not used in melee): its attacks use Dexterity",
        kind: "flag",
        label: "Ranged",
        field: WEAPON_RANGED,
      },
      range: {
        description: "Range increment in feet: a ranged weapon's, or a thrown melee weapon's (0 or absent = none)",
        kind: "number",
        label: "Range Increment (ft.)",
        field: WEAPON_RANGE,
      },
      maxRangeIncrements: {
        description:
          "How many range increments it reaches: 10 for a projectile weapon (a bow, a crossbow, a sling), 1 for a net (absent = 5)",
        kind: "number",
        label: "Range Increments",
        field: WEAPON_MAX_RANGE_INCREMENTS,
      },
      reach: {
        description: "Melee reach in feet (0 or absent = 5 ft.)",
        kind: "number",
        label: "Reach (ft.)",
        field: WEAPON_REACH,
      },
      finessable: {
        absent: null,
        description: "Whether a feat with FEAT_WEAPON_FINESSE (Weapon Finesse) lets this weapon attack with Dexterity",
        kind: "flag",
        label: "Finessable",
        field: WEAPON_FINESSABLE,
      },
      oneHandTraining: {
        absent: null,
        description:
          "Whether it's too large for one hand without training (a bastard sword): there, only its proficiency lets it be used",
        kind: "flag",
        label: "One-Hand Training",
        field: WEAPON_ONE_HAND_TRAINING,
      },
      oneHandedPenalty: {
        description:
          "Penalty to attack in one hand, when it takes two to load: a crossbow's (-2 light, -4 heavy; absent = none)",
        kind: "number",
        label: "One-Handed Penalty",
        field: WEAPON_ONE_HANDED_PENALTY,
      },
    },
    kind: "group",
    label: "Weapon",
    when: { column: "type", values: ["Weapon"] },
  },
  armor: {
    fields: {
      type: {
        description: "Base armor type for feat/modifier targeting (e.g. Leather Armor, Full Plate)",
        kind: "text",
        label: "Base Armor",
        field: ARMOR_TYPE,
        values: ARMOR_TYPE_NAMES,
      },
      proficiency: {
        description: "Armor proficiency classification (Light, Medium, Heavy)",
        kind: "text",
        label: "Proficiency",
        field: ARMOR_PROFICIENCY,
        values: ARMOR_PROFICIENCIES,
      },
      acBonus: {
        description: "Armor class bonus from armor",
        kind: "number",
        label: "Armor Bonus",
        field: ARMOR_AC_BONUS,
      },
    },
    kind: "group",
    label: "Armor",
    when: { column: "type", values: ["Armor"] },
  },
  shield: {
    fields: {
      type: {
        description: "Base shield type for feat/modifier targeting (e.g. Buckler, Tower Shield)",
        kind: "text",
        label: "Base Shield",
        field: SHIELD_TYPE,
        values: SHIELD_TYPE_NAMES,
      },
      proficiency: {
        description: "Shield proficiency classification (Light, Heavy, Tower)",
        kind: "text",
        label: "Proficiency",
        field: SHIELD_PROFICIENCY,
        values: SHIELD_PROFICIENCIES,
      },
      acBonus: {
        description: "Armor class bonus from shield",
        kind: "number",
        label: "Shield Bonus",
        field: SHIELD_AC_BONUS,
      },
    },
    kind: "group",
    label: "Shield",
    when: { column: "type", values: ["Shield"] },
  },
  /** An armor's, or a tower shield's. */
  maxDex: {
    description: "Maximum dexterity bonus allowed",
    kind: "number",
    label: "Max Dex Bonus",
    shownIn: WORN,
    field: ARMOR_MAX_DEX,
  },
  /** An armor's or a shield's. */
  checkPenalty: {
    description: "Penalty to Str/Dex-based skill checks",
    kind: "number",
    label: "Armor Check Penalty",
    shownIn: WORN,
    field: ARMOR_CHECK_PENALTY,
  },
  spellFailure: {
    description: "Arcane spell failure chance percentage",
    kind: "number",
    label: "Arcane Spell Failure (%)",
    shownIn: WORN,
    field: ITEM_SPELL_FAILURE,
  },
  masterwork: {
    absent: null,
    description: "Whether this item is masterwork quality (reduces armor check penalty by 1)",
    kind: "flag",
    label: "Masterwork",
    field: ITEM_MASTERWORK,
  },
  madeOf: {
    description: "Material composition",
    kind: "text",
    label: "Material",
    field: ITEM_MADE_OF,
    values: ["Adamantine", "Mithral", "Cold Iron", "Silver", "Darkwood"],
  },
  /** The charges it comes with, none for an item without charges. */
  charges: {
    description: "Default number of charges for this item",
    kind: "number",
    label: "Charges",
    field: ITEM_HAS_CHARGES,
  },
  magicCasterLevel: {
    description: "Caster level required to create this magic item",
    kind: "number",
    label: "Caster Level",
    field: MAGIC_CASTER_LEVEL,
  },
  magicAuras: {
    description: "Magic aura strength and school (e.g. Moderate transmutation)",
    kind: "list",
    label: "Auras",
    field: MAGIC_AURA,
  },
} as const;

/** A class's fields: the ability its bonus spells and spell DCs come from, and its caster type. */
const KLASS_FIELDS = {
  bonusSpellAbilityId: {
    description: "Ability score used for bonus spells per day",
    kind: "ref",
    label: "Bonus Spell Ability",
    references: "abilities",
    field: CLASS_BONUS_SPELL_ABILITY_ID,
    role: "bonusSpellAbility",
  },
  casterType: {
    description: "Whether this class casts arcane or divine spells",
    kind: "choice",
    label: "Caster Type",
    field: CLASS_CASTER_TYPE,
    values: CASTER_TYPES,
  },
} as const;

/**
 * A class level's fields: its base attack bonus and its skill points, in their bounds, 0 without their rows, both always
 * written.
 */
const KLASS_LEVEL_FIELDS = {
  bab: {
    default: 0,
    description: "Base attack bonus at this class level",
    kind: "number",
    label: "Base Attack Bonus",
    // A full base attack bonus's at the last level: one never outruns its level
    max: MAX_CLASS_LEVEL,
    min: 0,
    field: CLASS_LEVEL_BAB,
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
    write: "always",
  },
} as const;

/** A race's fields: whether armor and load leave its speed, and whether it walks on four legs. */
const RACE_FIELDS = {
  speedIgnoresEncumbrance: {
    description:
      "Whether the race keeps its speed in medium or heavy armor and under a medium or heavy load (the dwarf)",
    kind: "flag",
    label: "Speed Ignores Encumbrance",
    field: RACE_SPEED_IGNORES_ENCUMBRANCE,
  },
  quadruped: {
    description: "Whether the race walks on four legs, which carries more: x1 1/2 when Medium, x3 when Large (SRD)",
    kind: "flag",
    label: "Quadruped",
    field: RACE_QUADRUPED,
  },
} as const;

/**
 * A ruleset's own fields, its Settings: the ability its characters' skill points come from, which a ruleset always
 * names, and its progression, which every character follows whatever its classes: the feats its levels give it to
 * pick, and the ability increases they give, each a frequency and more at the levels it names, the core rules'
 * without a row.
 */
const RULESET_FIELDS = {
  skillPointAbilityId: {
    description: "The ability whose modifier a character adds to the skill points each of its levels gives",
    kind: "ref",
    label: "Skill Point Ability",
    references: "abilities",
    required: true,
    field: RULESET_SKILL_POINT_ABILITY_ID,
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
  },
} as const;

/**
 * A skill's fields: whether armor weighs on it, how many times over, and whether it's usable untrained. Without their
 * rows, armor doesn't weigh on it and it needs training. The multiplier only counts on a skill armor weighs on: any
 * other keeps 1.
 */
const SKILL_FIELDS = {
  impactedByWeight: {
    description: "Whether the skill is impacted by armor check penalty",
    kind: "flag",
    label: "Impacted by Weight",
    field: SKILL_IMPACTED_BY_WEIGHT,
  },
  checkPenaltyMultiplier: {
    default: 1,
    description: "How many times over the skill takes the armor check penalty (2 for Swim)",
    kind: "number",
    label: "Armor Check Penalty Multiplier",
    min: 1,
    field: SKILL_CHECK_PENALTY_MULTIPLIER,
    when: { field: "impactedByWeight", values: [true] },
  },
  usableWithoutTraining: {
    description: "Whether the skill can be used without training",
    kind: "flag",
    label: "Usable Without Training",
    field: SKILL_USABLE_WITHOUT_TRAINING,
  },
} as const;

/** A spell's fields, in the order a 3.5 stat block shows them: its school, components, range… */
const SPELL_FIELDS = {
  school: {
    description: "Spell school (Abjuration, Conjuration, etc.)",
    kind: "text",
    label: "School",
    field: SPELL_SCHOOL,
    values: SPELL_SCHOOLS,
  },
  subschool: {
    description: "Spell subschool (Calling, Charm, Creation, etc.)",
    kind: "text",
    label: "Subschool",
    field: SPELL_SUBSCHOOL,
    values: SPELL_SUBSCHOOLS,
  },
  descriptors: {
    description: "Spell descriptor (Fire, Cold, Mind-Affecting, etc.)",
    kind: "list",
    label: "Descriptors",
    field: SPELL_DESCRIPTOR,
    values: SPELL_DESCRIPTORS,
  },
  components: {
    description: "Required component (Verbal, Somatic, Material, Focus, Divine Focus, XP Cost)",
    kind: "list",
    label: "Components",
    field: SPELL_COMPONENT,
    values: SPELL_COMPONENTS,
  },
  castingTime: {
    description: 'Time to cast (e.g., "1 standard action", "1 round")',
    kind: "text",
    label: "Casting Time",
    placeholder: 'e.g., "1 standard action"',
    field: SPELL_CASTING_TIME,
  },
  rangeType: {
    description: 'Range, as its book writes it (e.g., "Touch", "Close (25 ft. + 5 ft./2 levels)", "60 ft.")',
    kind: "text",
    label: "Range",
    placeholder: 'e.g., "Close (25 ft. + 5 ft./2 levels)"',
    field: SPELL_RANGE_TYPE,
  },
  target: {
    description: 'Valid targets (e.g., "One creature", "You")',
    kind: "text",
    label: "Target",
    placeholder: 'e.g., "One creature"',
    field: SPELL_TARGET,
  },
  effect: {
    description: 'What the spell brings into being (e.g., "One summoned creature", "Ray")',
    kind: "text",
    label: "Effect",
    placeholder: 'e.g., "One summoned creature"',
    field: SPELL_EFFECT,
  },
  areaOfEffect: {
    description: 'Area of effect (e.g., "20-ft. radius", "Cone")',
    kind: "text",
    label: "Area of Effect",
    placeholder: 'e.g., "20-ft. radius"',
    field: SPELL_AREA_OF_EFFECT,
  },
  duration: {
    description: 'Duration description (e.g., "1 round/level", "Instantaneous")',
    kind: "text",
    label: "Duration",
    placeholder: 'e.g., "1 round/level"',
    field: SPELL_DURATION,
  },
  spellResistance: {
    description: 'Whether spell resistance applies, as its book writes it (e.g., "Yes", "No", "Yes (harmless)")',
    kind: "text",
    label: "Spell Resistance",
    placeholder: 'e.g., "Yes (harmless)"',
    field: SPELL_RESISTANCE,
  },
} as const;

/**
 * Each entity type's fields, by name, in the order its stat block shows them (and its form its fields): the one
 * declaration of each, which the engine's codecs are built from.
 */
export const ENTITY_FIELDS = {
  feats: FEAT_FIELDS,
  items: ITEM_FIELDS,
  classes: KLASS_FIELDS,
  class_levels: KLASS_LEVEL_FIELDS,
  spells: SPELL_FIELDS,
  races: RACE_FIELDS,
  rulesets: RULESET_FIELDS,
  skills: SKILL_FIELDS,
} as const;
