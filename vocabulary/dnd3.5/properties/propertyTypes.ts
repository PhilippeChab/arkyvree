/**
 * The D&D 3.5 property types, which keep an entity's fields: each entity type's, in the order a stat block shows them,
 * each with its field's label and what it means, the values each takes, and the entity one's value names. The engine
 * reads them through the 3.5 module's property types: a form's fields (`FieldCodec.describe`), what a save holds a
 * field to, and the order a ruleset's view keeps every entity's properties in (`PropertyOrder`).
 */

import type { PropertyEntityType } from "@/shared/customization/entities.ts";
import { FEAT_FAMILIES } from "@/vocabulary/dnd3.5/feats.ts";
import { SPELL_COMPONENTS, SPELL_DESCRIPTORS, SPELL_SCHOOLS, SPELL_SUBSCHOOLS } from "@/vocabulary/dnd3.5/spells.ts";

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
import { KLASS_BONUS_SPELL_ABILITY_ID, KLASS_CASTER_TYPE } from "./klass.ts";
import { KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS } from "./klassLevel.ts";
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
} from "./power.ts";
import { RACE_QUADRUPED, RACE_SPEED_IGNORES_ENCUMBRANCE } from "./race.ts";
import { RULESET_SKILL_POINT_ABILITY_ID } from "./ruleset.ts";
import { SHIELD_AC_BONUS, SHIELD_PROFICIENCY, SHIELD_TYPE } from "./shield.ts";
import { SKILL_CHECK_PENALTY_MULTIPLIER, SKILL_IMPACTED_BY_WEIGHT, SKILL_USABLE_WITHOUT_TRAINING } from "./skill.ts";
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

/** A property type as an entity type declares it: its field's label, what it's for, and a text's example. */
interface PropertyTypeDeclaration {
  description: string;
  label: string;
  placeholder?: string;
}

const ARMOR_TYPE_NAMES = [
  "Banded Mail",
  "Breastplate",
  "Chain Mail",
  "Chain Shirt",
  "Full Plate",
  "Half-Plate",
  "Hide Armor",
  "Leather Armor",
  "Padded Armor",
  "Scale Mail",
  "Splint Mail",
  "Studded Leather",
];

const FEAT_PROPERTY_TYPES: Record<string, PropertyTypeDeclaration> = {
  [FEAT_FAMILY]: { label: "Families", description: "Feat family grouping (Weapon Focus, Spell Focus, etc.)" },
  [FEAT_WEAPON_FINESSE]: {
    label: "Weapon Finesse",
    description: "Whether the feat lets its owner attack with Dexterity with a finessable weapon (Weapon Finesse)",
  },
  [FEAT_OVERSIZED_TWO_WEAPON_FIGHTING]: {
    label: "Oversized Two-Weapon Fighting",
    description:
      "Whether the feat makes a one-handed off-hand weapon count as light in two-weapon fighting (Oversized Two-Weapon Fighting)",
  },
  [WIZARD_PROHIBITED_SCHOOL]: {
    label: "Prohibited Schools",
    description: "School of magic prohibited by wizard specialization",
  },
};

/**
 * An item's property types: its weapon's, its armor's and its shield's, then what any item has, in the order its form
 * pairs them.
 */
const ITEM_PROPERTY_TYPES: Record<string, PropertyTypeDeclaration> = {
  [WEAPON_TYPE]: {
    label: "Base Weapon",
    description: "Base weapon type for feat/modifier targeting (e.g. Longsword, Shortsword)",
  },
  [WEAPON_PROFICIENCY]: {
    label: "Proficiency",
    description: "Weapon proficiency classification (Simple, Martial, Exotic)",
  },
  [WEAPON_FAMILY]: { label: "Family", description: "Weapon family grouping (Sword, Axe, Bow, etc.)" },
  [WEAPON_SIZE]: {
    label: "Size",
    description:
      "The weapon's effort, as the table gives it for a Medium wielder: Tiny or Small light, Medium one-handed, Large two-handed",
  },
  [WEAPON_BASE_DAMAGE]: { label: "Damage", description: "Base damage dice for weapons", placeholder: 'e.g., "1d8"' },
  [WEAPON_DOUBLE_DAMAGE]: {
    label: "Other End's Damage",
    description: "A double weapon's other end's damage dice: in two hands, it fights as two weapons",
    placeholder: 'e.g., "1d6"',
  },
  [DAMAGE_TYPE]: { label: "Damage Types", description: "Type of damage dealt" },
  [WEAPON_CRITICAL_RANGE]: {
    label: "Critical Range",
    description: "Critical threat count (1 = 20, 2 = 19-20, 3 = 18-20, etc.)",
  },
  [WEAPON_CRITICAL_MULTIPLIER]: { label: "Critical Multiplier", description: "Critical hit damage multiplier" },
  [WEAPON_STRENGTH_DAMAGE]: {
    label: "Strength to Damage",
    description: "Strength to damage: Slot (the hand's share; default), Rating (bows: up to Mighty), None",
  },
  [WEAPON_MIGHTY]: {
    label: "Mighty Rating",
    description: "A composite bow's Strength rating: the most Strength bonus it adds to damage; below it, -2 to attack",
  },
  [WEAPON_RANGED]: {
    label: "Ranged",
    description: "Whether it's a ranged weapon (thrown or projectile, not used in melee): its attacks use Dexterity",
  },
  [WEAPON_RANGE]: {
    label: "Range Increment (ft.)",
    description: "Range increment in feet: a ranged weapon's, or a thrown melee weapon's (0 or absent = none)",
  },
  [WEAPON_MAX_RANGE_INCREMENTS]: {
    label: "Range Increments",
    description:
      "How many range increments it reaches: 10 for a projectile weapon (a bow, a crossbow, a sling), 1 for a net (absent = 5)",
  },
  [WEAPON_REACH]: { label: "Reach (ft.)", description: "Melee reach in feet (0 or absent = 5 ft.)" },
  [WEAPON_FINESSABLE]: {
    label: "Finessable",
    description: "Whether a feat with FEAT_WEAPON_FINESSE (Weapon Finesse) lets this weapon attack with Dexterity",
  },
  [WEAPON_ONE_HAND_TRAINING]: {
    label: "One-Hand Training",
    description:
      "Whether it's too large for one hand without training (a bastard sword): there, only its proficiency lets it be used",
  },
  [WEAPON_ONE_HANDED_PENALTY]: {
    label: "One-Handed Penalty",
    description:
      "Penalty to attack in one hand, when it takes two to load: a crossbow's (-2 light, -4 heavy; absent = none)",
  },
  [ARMOR_TYPE]: {
    label: "Base Armor",
    description: "Base armor type for feat/modifier targeting (e.g. Leather Armor, Full Plate)",
  },
  [ARMOR_PROFICIENCY]: { label: "Proficiency", description: "Armor proficiency classification (Light, Medium, Heavy)" },
  [ARMOR_AC_BONUS]: { label: "Armor Bonus", description: "Armor class bonus from armor" },
  [SHIELD_TYPE]: {
    label: "Base Shield",
    description: "Base shield type for feat/modifier targeting (e.g. Buckler, Tower Shield)",
  },
  [SHIELD_PROFICIENCY]: {
    label: "Proficiency",
    description: "Shield proficiency classification (Light, Heavy, Tower)",
  },
  [SHIELD_AC_BONUS]: { label: "Shield Bonus", description: "Armor class bonus from shield" },
  [ITEM_MASTERWORK]: {
    label: "Masterwork",
    description: "Whether this item is masterwork quality (reduces armor check penalty by 1)",
  },
  [ITEM_MADE_OF]: { label: "Material", description: "Material composition" },
  [ARMOR_MAX_DEX]: { label: "Max Dex Bonus", description: "Maximum dexterity bonus allowed" },
  [ARMOR_CHECK_PENALTY]: { label: "Armor Check Penalty", description: "Penalty to Str/Dex-based skill checks" },
  [ITEM_SPELL_FAILURE]: { label: "Arcane Spell Failure (%)", description: "Arcane spell failure chance percentage" },
  [ITEM_HAS_CHARGES]: { label: "Charges", description: "Default number of charges for this item" },
  [MAGIC_CASTER_LEVEL]: { label: "Caster Level", description: "Caster level required to create this magic item" },
  [MAGIC_AURA]: {
    label: "Auras",
    description: "Magic aura strength and school (e.g. Moderate transmutation)",
  },
};

const KLASS_LEVEL_PROPERTY_TYPES: Record<string, PropertyTypeDeclaration> = {
  [KLASS_LEVEL_BAB]: { label: "Base Attack Bonus", description: "Base attack bonus at this class level" },
  [KLASS_LEVEL_SKILL_POINTS]: { label: "Skill Points", description: "Skill points gained per level" },
};

const KLASS_PROPERTY_TYPES: Record<string, PropertyTypeDeclaration> = {
  [KLASS_BONUS_SPELL_ABILITY_ID]: {
    label: "Bonus Spell Ability",
    description: "Ability score used for bonus spells per day",
  },
  [KLASS_CASTER_TYPE]: { label: "Caster Type", description: "Whether this class casts arcane or divine spells" },
};

/** A spell's property types, in the order a 3.5 stat block shows them. */
const POWER_PROPERTY_TYPES: Record<string, PropertyTypeDeclaration> = {
  [SPELL_SCHOOL]: { label: "School", description: "Spell school (Abjuration, Conjuration, etc.)" },
  [SPELL_SUBSCHOOL]: { label: "Subschool", description: "Spell subschool (Calling, Charm, Creation, etc.)" },
  [SPELL_DESCRIPTOR]: { label: "Descriptors", description: "Spell descriptor (Fire, Cold, Mind-Affecting, etc.)" },
  [SPELL_COMPONENT]: {
    label: "Components",
    description: "Required component (Verbal, Somatic, Material, Focus, Divine Focus, XP Cost)",
  },
  [SPELL_CASTING_TIME]: {
    label: "Casting Time",
    description: 'Time to cast (e.g., "1 standard action", "1 round")',
    placeholder: 'e.g., "1 standard action"',
  },
  [SPELL_RANGE_TYPE]: {
    label: "Range",
    description: 'Range, as its book writes it (e.g., "Touch", "Close (25 ft. + 5 ft./2 levels)", "60 ft.")',
    placeholder: 'e.g., "Close (25 ft. + 5 ft./2 levels)"',
  },
  [SPELL_TARGET]: {
    label: "Target",
    description: 'Valid targets (e.g., "One creature", "You")',
    placeholder: 'e.g., "One creature"',
  },
  [SPELL_EFFECT]: {
    label: "Effect",
    description: 'What the spell brings into being (e.g., "One summoned creature", "Ray")',
    placeholder: 'e.g., "One summoned creature"',
  },
  [SPELL_AREA_OF_EFFECT]: {
    label: "Area of Effect",
    description: 'Area of effect (e.g., "20-ft. radius", "Cone")',
    placeholder: 'e.g., "20-ft. radius"',
  },
  [SPELL_DURATION]: {
    label: "Duration",
    description: 'Duration description (e.g., "1 round/level", "Instantaneous")',
    placeholder: 'e.g., "1 round/level"',
  },
  [SPELL_RESISTANCE]: {
    label: "Spell Resistance",
    description: 'Whether spell resistance applies, as its book writes it (e.g., "Yes", "No", "Yes (harmless)")',
    placeholder: 'e.g., "Yes (harmless)"',
  },
};

const RACE_PROPERTY_TYPES: Record<string, PropertyTypeDeclaration> = {
  [RACE_SPEED_IGNORES_ENCUMBRANCE]: {
    label: "Speed Ignores Encumbrance",
    description:
      "Whether the race keeps its speed in medium or heavy armor and under a medium or heavy load (the dwarf)",
  },
  [RACE_QUADRUPED]: {
    label: "Quadruped",
    description: "Whether the race walks on four legs, which carries more: x1 1/2 when Medium, x3 when Large (SRD)",
  },
};

const RULESET_PROPERTY_TYPES: Record<string, PropertyTypeDeclaration> = {
  [RULESET_SKILL_POINT_ABILITY_ID]: {
    label: "Skill Point Ability",
    description: "The ability whose modifier a character adds to the skill points each of its levels gives",
  },
};

const SHIELD_TYPE_NAMES = [
  "Buckler",
  "Heavy Steel Shield",
  "Heavy Wooden Shield",
  "Light Steel Shield",
  "Light Wooden Shield",
  "Tower Shield",
];

const SKILL_PROPERTY_TYPES: Record<string, PropertyTypeDeclaration> = {
  [SKILL_IMPACTED_BY_WEIGHT]: {
    label: "Impacted by Weight",
    description: "Whether the skill is impacted by armor check penalty",
  },
  [SKILL_CHECK_PENALTY_MULTIPLIER]: {
    label: "Armor Check Penalty Multiplier",
    description: "How many times over the skill takes the armor check penalty (2 for Swim)",
  },
  [SKILL_USABLE_WITHOUT_TRAINING]: {
    label: "Usable Without Training",
    description: "Whether the skill can be used without training",
  },
};

const WEAPON_TYPE_NAMES = [
  "Bastard Sword",
  "Battleaxe",
  "Bolas",
  "Club",
  "Composite Longbow",
  "Composite Shortbow",
  "Dagger",
  "Dart",
  "Dire Flail",
  "Dwarven Urgrosh",
  "Dwarven Waraxe",
  "Falchion",
  "Flail",
  "Gauntlet",
  "Glaive",
  "Gnome Hooked Hammer",
  "Greataxe",
  "Greatclub",
  "Greatsword",
  "Guisarme",
  "Halberd",
  "Hand Crossbow",
  "Handaxe",
  "Heavy Crossbow",
  "Heavy Flail",
  "Heavy Mace",
  "Heavy Pick",
  "Javelin",
  "Kama",
  "Kukri",
  "Lance",
  "Light Crossbow",
  "Light Hammer",
  "Light Mace",
  "Light Pick",
  "Longbow",
  "Longspear",
  "Longsword",
  "Morningstar",
  "Net",
  "Nunchaku",
  "Orc Double Axe",
  "Punching Dagger",
  "Quarterstaff",
  "Ranseur",
  "Rapier",
  "Repeating Heavy Crossbow",
  "Repeating Light Crossbow",
  "Sai",
  "Sap",
  "Scimitar",
  "Scythe",
  "Shortbow",
  "Shortspear",
  "Shortsword",
  "Shuriken",
  "Siangham",
  "Sickle",
  "Sling",
  "Spear",
  "Spiked Chain",
  "Spiked Gauntlet",
  "Throwing Axe",
  "Trident",
  "Two-Bladed Sword",
  "Warhammer",
  "Whip",
];

/**
 * Each entity type's property types, by name, in the order its stat block shows them (and its form its fields): each
 * with its field's label, what it's for, and a text field's example (`placeholder`).
 */
export const ENTITY_PROPERTY_TYPES: Partial<Record<PropertyEntityType, Record<string, PropertyTypeDeclaration>>> = {
  feats: FEAT_PROPERTY_TYPES,
  items: ITEM_PROPERTY_TYPES,
  klasses: KLASS_PROPERTY_TYPES,
  klass_levels: KLASS_LEVEL_PROPERTY_TYPES,
  powers: POWER_PROPERTY_TYPES,
  races: RACE_PROPERTY_TYPES,
  rulesets: RULESET_PROPERTY_TYPES,
  skills: SKILL_PROPERTY_TYPES,
};

/**
 * The entity kind a property type's value names, by its id: an ability, for a class's bonus spells and the ruleset's
 * skill points. A list names the entity, never its id.
 */
export const PROPERTY_REFERENCES: Partial<Record<string, "abilities">> = {
  [KLASS_BONUS_SPELL_ABILITY_ID]: "abilities",
  [RULESET_SKILL_POINT_ABILITY_ID]: "abilities",
};

/**
 * The values each property type takes, in their order, when it takes a closed list of them: its field's options, which
 * its save holds it to. A free-text type has none.
 */
export const PROPERTY_VALUES: Partial<Record<string, string[]>> = {
  [WEAPON_PROFICIENCY]: ["Simple", "Martial", "Exotic"],
  [WEAPON_FAMILY]: [
    "Axe",
    "Bow",
    "Close",
    "Club",
    "Crossbow",
    "Dagger",
    "Flail",
    "Hammer",
    "Mace",
    "Monk",
    "Pick",
    "Polearm",
    "Sickle",
    "Sling",
    "Spear",
    "Staff",
    "Sword",
    "Thrown",
  ],
  [DAMAGE_TYPE]: ["Slashing", "Piercing", "Bludgeoning"],
  [ARMOR_PROFICIENCY]: ["Light", "Medium", "Heavy"],
  [ARMOR_TYPE]: [...ARMOR_TYPE_NAMES],
  [SHIELD_PROFICIENCY]: ["Light", "Heavy", "Tower"],
  [SHIELD_TYPE]: [...SHIELD_TYPE_NAMES],
  [SPELL_SCHOOL]: [...SPELL_SCHOOLS],
  [SPELL_SUBSCHOOL]: [...SPELL_SUBSCHOOLS],
  [SPELL_DESCRIPTOR]: [...SPELL_DESCRIPTORS],
  [SPELL_COMPONENT]: [...SPELL_COMPONENTS],
  [ITEM_MADE_OF]: ["Adamantine", "Mithral", "Cold Iron", "Silver", "Darkwood"],
  [SKILL_IMPACTED_BY_WEIGHT]: ["true", "false"],
  [SKILL_USABLE_WITHOUT_TRAINING]: ["true", "false"],
  [ITEM_MASTERWORK]: ["true", "false"],
  [WEAPON_FINESSABLE]: ["true", "false"],
  [WEAPON_RANGED]: ["true", "false"],
  [WEAPON_STRENGTH_DAMAGE]: ["Slot", "Rating", "None"],
  [FEAT_WEAPON_FINESSE]: ["true", "false"],
  [FEAT_OVERSIZED_TWO_WEAPON_FIGHTING]: ["true", "false"],
  [WEAPON_ONE_HAND_TRAINING]: ["true", "false"],
  [WEAPON_TYPE]: [...WEAPON_TYPE_NAMES],
  [KLASS_CASTER_TYPE]: ["Arcane", "Divine"],
  [FEAT_FAMILY]: [...FEAT_FAMILIES],
  [RACE_SPEED_IGNORES_ENCUMBRANCE]: ["true", "false"],
  [RACE_QUADRUPED]: ["true", "false"],
};
