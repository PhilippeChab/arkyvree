import type { PropertyTypesProvider } from "@/server/rulesets/types.ts";
import {
  ARMOR_AC_BONUS,
  ARMOR_CHECK_PENALTY,
  ARMOR_MAX_DEX,
  ARMOR_PROFICIENCY,
  ARMOR_TYPE,
  DAMAGE_TYPE,
  FEAT_FAMILY,
  WIZARD_PROHIBITED_SCHOOL,
  ITEM_HAS_CHARGES,
  ITEM_MADE_OF,
  ITEM_MASTERWORK,
  ITEM_SPELL_FAILURE,
  MAGIC_AURA,
  MAGIC_CASTER_LEVEL,
  KLASS_BONUS_SPELL_ABILITY_ID,
  KLASS_CASTER_TYPE,
  KLASS_LEVEL_BAB,
  KLASS_LEVEL_SKILL_POINTS,
  RULESET_SKILL_POINT_ABILITY_ID,
  SHIELD_AC_BONUS,
  SHIELD_PROFICIENCY,
  SHIELD_TYPE,
  SKILL_IMPACTED_BY_WEIGHT,
  SKILL_USABLE_WITHOUT_TRAINING,
  SPELL_AREA_OF_EFFECT,
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_DURATION,
  SPELL_DURATION_TYPE,
  SPELL_LEVEL,
  SPELL_MATERIAL,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SAVING_THROW,
  SPELL_SCHOOL,
  SPELL_SUBSCHOOL,
  SPELL_TARGET,
  WEAPON_BASE_DAMAGE,
  WEAPON_CRITICAL_MULTIPLIER,
  WEAPON_CRITICAL_RANGE,
  WEAPON_FAMILY,
  WEAPON_MIGHTY,
  WEAPON_PROFICIENCY,
  WEAPON_RANGE,
  WEAPON_REACH,
  WEAPON_SIZE,
  WEAPON_FINESSABLE,
  WEAPON_TYPE,
} from "@/server/rulesets/dnd3.5/properties/index.ts";
import type { EntityType } from "@/shared/customization/properties.ts";
import { SPELL_SCHOOLS, SPELL_SUBSCHOOLS, SPELL_DESCRIPTORS, SPELL_COMPONENTS, SPELL_RANGE_TYPES, SPELL_DURATION_TYPES, SPELL_RESISTANCE_OPTIONS, SPELL_SAVING_THROWS } from "@/shared/dnd3.5/spells.ts";
// Static autocomplete hints for property value dropdowns
const WEAPON_TYPE_NAMES = [
  "Bastard Sword", "Battleaxe", "Bolas",
  "Club", "Composite Longbow", "Composite Shortbow",
  "Dagger", "Dart", "Dire Flail", "Dwarven Urgrosh", "Dwarven Waraxe",
  "Falchion", "Flail",
  "Gauntlet", "Glaive", "Gnome Hooked Hammer", "Greataxe", "Greatclub", "Greatsword", "Guisarme",
  "Halberd", "Hand Crossbow", "Handaxe", "Heavy Crossbow", "Heavy Flail", "Heavy Mace", "Heavy Pick",
  "Javelin", "Kama", "Kukri",
  "Lance", "Light Crossbow", "Light Hammer", "Light Mace", "Light Pick", "Longbow", "Longspear", "Longsword",
  "Morningstar",
  "Net", "Nunchaku",
  "Orc Double Axe",
  "Punching Dagger",
  "Quarterstaff",
  "Ranseur", "Rapier", "Repeating Heavy Crossbow", "Repeating Light Crossbow",
  "Sai", "Sap", "Scimitar", "Scythe", "Shortbow", "Shortspear", "Shortsword", "Shuriken", "Siangham", "Sickle", "Sling", "Spear", "Spiked Chain", "Spiked Gauntlet",
  "Throwing Axe", "Trident", "Two-Bladed Sword",
  "Warhammer", "Whip",
];

const ARMOR_TYPE_NAMES = [
  "Banded Mail", "Breastplate", "Chain Mail", "Chain Shirt",
  "Full Plate", "Half-Plate", "Hide Armor",
  "Leather Armor", "Padded Armor", "Scale Mail",
  "Splint Mail", "Studded Leather",
];

const SHIELD_TYPE_NAMES = [
  "Buckler", "Heavy Steel Shield", "Heavy Wooden Shield",
  "Light Steel Shield", "Light Wooden Shield", "Tower Shield",
];

const ITEM_PROPERTY_TYPES: Record<string, string> = {
  [WEAPON_PROFICIENCY]: "Weapon proficiency classification (Simple, Martial, Exotic)",
  [WEAPON_FAMILY]: "Weapon family grouping (Sword, Axe, Bow, etc.)",
  [WEAPON_BASE_DAMAGE]: "Base damage dice for weapons",
  [WEAPON_CRITICAL_RANGE]: "Critical threat count (1 = 20, 2 = 19-20, 3 = 18-20, etc.)",
  [WEAPON_CRITICAL_MULTIPLIER]: "Critical hit damage multiplier",
  [WEAPON_MIGHTY]: "Mighty composite bow rating (max STR bonus to damage)",
  [WEAPON_RANGE]: "Range increment in feet (0 or absent = melee)",
  [WEAPON_REACH]: "Melee reach in feet (0 or absent = 5 ft.)",
  [WEAPON_SIZE]: "Weapon size category (Small, Medium, Large)",
  [ARMOR_PROFICIENCY]: "Armor proficiency classification (Light, Medium, Heavy)",
  [ARMOR_TYPE]: "Base armor type for feat/modifier targeting (e.g. Leather Armor, Full Plate)",
  [ARMOR_MAX_DEX]: "Maximum dexterity bonus allowed",
  [ARMOR_AC_BONUS]: "Armor class bonus from armor",
  [ARMOR_CHECK_PENALTY]: "Penalty to Str/Dex-based skill checks",
  [ITEM_SPELL_FAILURE]: "Arcane spell failure chance percentage",
  [SHIELD_PROFICIENCY]: "Shield proficiency classification (Light, Heavy, Tower)",
  [SHIELD_TYPE]: "Base shield type for feat/modifier targeting (e.g. Buckler, Tower Shield)",
  [SHIELD_AC_BONUS]: "Armor class bonus from shield",
  [DAMAGE_TYPE]: "Type of damage dealt",
  [ITEM_MADE_OF]: "Material composition",
  [ITEM_HAS_CHARGES]: "Default number of charges for this item",
  [ITEM_MASTERWORK]: "Whether this item is masterwork quality (reduces armor check penalty by 1)",
  [WEAPON_FINESSABLE]: "Whether this weapon can use Dexterity for attack rolls (Weapon Finesse)",
  [WEAPON_TYPE]: "Base weapon type for feat/modifier targeting (e.g. Longsword, Shortsword)",
  [MAGIC_AURA]: "Magic aura strength and school (e.g. Moderate transmutation)",
  [MAGIC_CASTER_LEVEL]: "Caster level required to create this magic item",
};

const RULESET_PROPERTY_TYPES: Record<string, string> = {
  [RULESET_SKILL_POINT_ABILITY_ID]: "Ability used for skill point calculation",
};

const SKILL_PROPERTY_TYPES: Record<string, string> = {
  [SKILL_IMPACTED_BY_WEIGHT]: "Whether the skill is impacted by armor check penalty",
  [SKILL_USABLE_WITHOUT_TRAINING]: "Whether the skill can be used without training",
};

const KLASS_LEVEL_PROPERTY_TYPES: Record<string, string> = {
  [KLASS_LEVEL_BAB]: "Base attack bonus at this class level",
  [KLASS_LEVEL_SKILL_POINTS]: "Skill points gained per level",
};

const KLASS_PROPERTY_TYPES: Record<string, string> = {
  [KLASS_BONUS_SPELL_ABILITY_ID]: "Ability score used for bonus spells per day",
  [KLASS_CASTER_TYPE]: "Whether this class casts arcane or divine spells",
};

const FEAT_PROPERTY_TYPES: Record<string, string> = {
  [FEAT_FAMILY]: "Feat family grouping (Weapon Focus, Spell Focus, etc.)",
  [WIZARD_PROHIBITED_SCHOOL]: "School of magic prohibited by wizard specialization",
};

const POWER_PROPERTY_TYPES: Record<string, string> = {
  [SPELL_SCHOOL]: "Spell school (Abjuration, Conjuration, etc.)",
  [SPELL_SUBSCHOOL]: "Spell subschool (Calling, Charm, Creation, etc.)",
  [SPELL_DESCRIPTOR]: "Spell descriptor (Fire, Cold, Mind-Affecting, etc.)",
  [SPELL_COMPONENT]: "Required component (Verbal, Somatic, Material, Focus, Divine Focus, XP Cost)",
  [SPELL_RANGE_TYPE]: "Range category (Personal, Touch, Close, Medium, Long, Unlimited)",
  [SPELL_DURATION_TYPE]: "Duration category (Instantaneous, Concentration, Sustained, Permanent, etc.)",
  [SPELL_RESISTANCE]: "Whether spell resistance applies (Yes/No)",
  [SPELL_SAVING_THROW]: "Saving throw type and effect (None, Fortitude negates, Reflex half, etc.)",
  [SPELL_LEVEL]: "Spell level for a class (e.g., \"Wizard 3\", \"Cleric 2\")",
  [SPELL_MATERIAL]: "Material component description",
  [SPELL_CASTING_TIME]: "Time to cast (e.g., \"1 standard action\", \"1 round\")",
  [SPELL_TARGET]: "Valid targets (e.g., \"One creature\", \"You\")",
  [SPELL_DURATION]: "Duration description (e.g., \"1 round/level\", \"Instantaneous\")",
  [SPELL_AREA_OF_EFFECT]: "Area of effect (e.g., \"20-ft. radius\", \"Cone\")",
};

const ENTITY_PROPERTY_TYPES: Partial<Record<EntityType, Record<string, string>>> = {
  feats: FEAT_PROPERTY_TYPES,
  items: ITEM_PROPERTY_TYPES,
  klasses: KLASS_PROPERTY_TYPES,
  klass_levels: KLASS_LEVEL_PROPERTY_TYPES,
  powers: POWER_PROPERTY_TYPES,
  rulesets: RULESET_PROPERTY_TYPES,
  skills: SKILL_PROPERTY_TYPES,
};

const PROPERTY_VALUES: Record<string, string[]> = {
  [WEAPON_PROFICIENCY]: ["Simple", "Martial", "Exotic"],
  [WEAPON_FAMILY]: ["Axe", "Bow", "Close", "Club", "Crossbow", "Dagger", "Flail", "Hammer", "Mace", "Monk", "Pick", "Polearm", "Sickle", "Sling", "Spear", "Staff", "Sword", "Thrown"],
  [DAMAGE_TYPE]: ["Slashing", "Piercing", "Bludgeoning"],
  [ARMOR_PROFICIENCY]: ["Light", "Medium", "Heavy"],
  [ARMOR_TYPE]: [...ARMOR_TYPE_NAMES],
  [SHIELD_PROFICIENCY]: ["Light", "Heavy", "Tower"],
  [SHIELD_TYPE]: [...SHIELD_TYPE_NAMES],
  [SPELL_SCHOOL]: [...SPELL_SCHOOLS],
  [SPELL_SUBSCHOOL]: [...SPELL_SUBSCHOOLS],
  [SPELL_DESCRIPTOR]: [...SPELL_DESCRIPTORS],
  [SPELL_COMPONENT]: [...SPELL_COMPONENTS],
  [SPELL_RANGE_TYPE]: [...SPELL_RANGE_TYPES],
  [SPELL_DURATION_TYPE]: [...SPELL_DURATION_TYPES],
  [SPELL_RESISTANCE]: [...SPELL_RESISTANCE_OPTIONS],
  [SPELL_SAVING_THROW]: [...SPELL_SAVING_THROWS],
  [ITEM_MADE_OF]: ["Adamantine", "Mithral", "Cold Iron", "Silver", "Darkwood"],
  [SKILL_IMPACTED_BY_WEIGHT]: ["true", "false"],
  [SKILL_USABLE_WITHOUT_TRAINING]: ["true", "false"],
  [ITEM_MASTERWORK]: ["true", "false"],
  [WEAPON_FINESSABLE]: ["true", "false"],
  [WEAPON_TYPE]: [...WEAPON_TYPE_NAMES],
  [KLASS_CASTER_TYPE]: ["Arcane", "Divine"],
  [FEAT_FAMILY]: [
    "Weapon Focus", "Greater Weapon Focus", "Weapon Specialization", "Greater Weapon Specialization",
    "Improved Critical", "Martial Weapon Proficiency", "Exotic Weapon Proficiency", "Rapid Reload",
    "Spell Focus", "Greater Spell Focus", "Skill Focus",
    "Metamagic", "Item Creation",
    "Turn or Rebuke Undead", "Wild Shape",
  ],
};

export default class Dnd35PropertyTypes implements PropertyTypesProvider {
  getStaticPropertyTypes(entityType?: EntityType): Record<string, string> {
    if (!entityType) {
      return { ...FEAT_PROPERTY_TYPES, ...ITEM_PROPERTY_TYPES, ...KLASS_PROPERTY_TYPES, ...KLASS_LEVEL_PROPERTY_TYPES, ...POWER_PROPERTY_TYPES, ...RULESET_PROPERTY_TYPES, ...SKILL_PROPERTY_TYPES };
    }

    return ENTITY_PROPERTY_TYPES[entityType] ?? {};
  }

  getStaticPropertyValues(type: string): string[] | null {
    return PROPERTY_VALUES[type] ?? null;
  }
}
