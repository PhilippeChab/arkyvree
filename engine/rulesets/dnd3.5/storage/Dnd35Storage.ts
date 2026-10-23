import type { FieldDef, Merge, StorageDeclaration, ValueKind } from "@/engine/core/module/index.ts";

/**
 * The fields 3.5's properties hold (an entity type's, or a ruleset's), each its owner's type, its name (the property's
 * type), its value's kind, whether it's a set, and whether an item reads it off its template when it has none.
 */
const PROPERTY_FIELDS: [
  ownerType: string,
  field: string,
  valueKind: ValueKind,
  multiple: boolean,
  inherits: boolean,
][] = [
  ["feats", "FEAT_FAMILY", "text", true, false],
  ["feats", "FEAT_WEAPON_FINESSE", "flag", false, false],
  ["feats", "FEAT_OVERSIZED_TWO_WEAPON_FIGHTING", "flag", false, false],
  ["feats", "WIZARD_PROHIBITED_SCHOOL", "text", true, false],
  ["items", "WEAPON_TYPE", "text", false, true],
  ["items", "WEAPON_PROFICIENCY", "text", false, true],
  ["items", "WEAPON_FAMILY", "text", false, true],
  ["items", "WEAPON_SIZE", "text", false, true],
  ["items", "WEAPON_BASE_DAMAGE", "text", false, true],
  ["items", "WEAPON_DOUBLE_DAMAGE", "text", false, true],
  ["items", "DAMAGE_TYPE", "text", true, true],
  ["items", "WEAPON_CRITICAL_RANGE", "number", false, true],
  ["items", "WEAPON_CRITICAL_MULTIPLIER", "number", false, true],
  ["items", "WEAPON_STRENGTH_DAMAGE", "text", false, true],
  ["items", "WEAPON_MIGHTY", "number", false, true],
  ["items", "WEAPON_RANGED", "flag", false, true],
  ["items", "WEAPON_RANGE", "number", false, true],
  ["items", "WEAPON_MAX_RANGE_INCREMENTS", "number", false, true],
  ["items", "WEAPON_REACH", "number", false, true],
  ["items", "WEAPON_FINESSABLE", "flag", false, true],
  ["items", "WEAPON_ONE_HAND_TRAINING", "flag", false, true],
  ["items", "WEAPON_ONE_HANDED_PENALTY", "number", false, true],
  ["items", "ARMOR_TYPE", "text", false, true],
  ["items", "ARMOR_PROFICIENCY", "text", false, true],
  ["items", "ARMOR_AC_BONUS", "number", false, true],
  ["items", "SHIELD_TYPE", "text", false, true],
  ["items", "SHIELD_PROFICIENCY", "text", false, true],
  ["items", "SHIELD_AC_BONUS", "number", false, true],
  ["items", "ARMOR_MAX_DEX", "number", false, true],
  ["items", "ARMOR_CHECK_PENALTY", "number", false, true],
  ["items", "ITEM_SPELL_FAILURE", "number", false, true],
  ["items", "ITEM_MASTERWORK", "flag", false, true],
  ["items", "ITEM_MADE_OF", "text", false, true],
  ["items", "ITEM_HAS_CHARGES", "number", false, true],
  ["items", "MAGIC_CASTER_LEVEL", "number", false, true],
  ["items", "MAGIC_AURA", "text", true, true],
  ["klasses", "KLASS_CASTER_TYPE", "text", false, false],
  ["klass_levels", "KLASS_LEVEL_BAB", "number", false, false],
  ["klass_levels", "KLASS_LEVEL_SKILL_POINTS", "number", false, false],
  ["powers", "SPELL_SCHOOL", "text", false, false],
  ["powers", "SPELL_SUBSCHOOL", "text", false, false],
  ["powers", "SPELL_DESCRIPTOR", "text", true, false],
  ["powers", "SPELL_COMPONENT", "text", true, false],
  ["powers", "SPELL_CASTING_TIME", "text", false, false],
  ["powers", "SPELL_RANGE_TYPE", "text", false, false],
  ["powers", "SPELL_TARGET", "text", false, false],
  ["powers", "SPELL_EFFECT", "text", false, false],
  ["powers", "SPELL_AREA_OF_EFFECT", "text", false, false],
  ["powers", "SPELL_DURATION", "text", false, false],
  ["powers", "SPELL_RESISTANCE", "text", false, false],
  ["races", "RACE_SPEED_IGNORES_ENCUMBRANCE", "flag", false, false],
  ["races", "RACE_QUADRUPED", "flag", false, false],
  ["rulesets", "RULESET_FEAT_ADVANCEMENT", "text", true, false],
  ["rulesets", "RULESET_ABILITY_INCREASES", "text", true, false],
  ["skills", "SKILL_IMPACTED_BY_WEIGHT", "flag", false, false],
  ["skills", "SKILL_CHECK_PENALTY_MULTIPLIER", "number", false, false],
  ["skills", "SKILL_USABLE_WITHOUT_TRAINING", "flag", false, false],
];

/** The fields 3.5's kinds' and characters' columns are stored in: each a single value, the winning copy's. */
const COLUMN_FIELDS: [ownerType: string, field: string, valueKind: ValueKind][] = [
  ["klasses", "KLASS_HD", "number"],
  ["feats", "FEAT_STACKABLE", "flag"],
  ["feats", "FEAT_SELECTABLE", "flag"],
  ["feats", "FEAT_GENERATED", "flag"],
  ["races", "RACE_SIZE", "text"],
  ["races", "RACE_BASE_SPEED", "number"],
  ["items", "ITEM_WEIGHT", "number"],
  ["items", "ITEM_COST_GP", "number"],
  ["items", "ITEM_TYPE", "text"],
  ["items", "ITEM_SLOT", "text"],
  ["items", "ITEM_IS_TEMPLATE", "flag"],
  ["languages", "LANGUAGE_TYPE", "text"],
  ["powers", "POWER_SAVE_EFFECT", "text"],
  ["characters", "CHARACTER_XP", "number"],
  ["characters", "CHARACTER_ALIGNMENT", "text"],
  ["characters", "CHARACTER_AGE", "number"],
  ["characters", "CHARACTER_GENDER", "text"],
  ["characters", "CHARACTER_HEIGHT", "text"],
  ["characters", "CHARACTER_WEIGHT", "text"],
  ["characters", "CHARACTER_DEITY", "text"],
];

/** A field's owner's kind, by its type. */
function ownerKindOf(ownerType: string): FieldDef["ownerKind"] {
  if (ownerType === "rulesets") return "ruleset";
  if (ownerType === "characters") return "character";
  return "entity";
}

/**
 * How a property's field merges across sibling copies: a ruleset's setting is the nearest ruleset's in its chain,
 * whole; a set unions its siblings' values; a single value is the winning copy's, else a sibling's.
 */
function propertyMerge(ownerType: string, multiple: boolean): Merge {
  if (ownerType === "rulesets") return "winner";
  return multiple ? "union" : "fallback";
}

/**
 * How 3.5 stores its data in the generic tables: its kinds' columns (a class's hit die is its `KLASS_HD` field, a
 * save's ability its `keyAbility` link), its joins (a feat's pools are its `listedIn` links), its characters' (a race is
 * a `race` link, a level an advancement, its feats `feats` picks), and its registries' rows, which migration 0080 wrote
 * (`tests/engine/rulesets/dnd3.5/storage.test.ts` checks the database holds them).
 */
export const DND35_STORAGE: StorageDeclaration = {
  kinds: {
    abilities: { columns: {} },
    aptitudes: { columns: {} },
    feats: {
      columns: {
        stackable: { kind: "flag", field: "FEAT_STACKABLE", default: false },
        selectable: { kind: "flag", field: "FEAT_SELECTABLE", default: true },
        generated: { kind: "flag", field: "FEAT_GENERATED", default: false },
      },
    },
    items: {
      columns: {
        sourceItemId: { kind: "link", role: "madeFrom" },
        isTemplate: { kind: "flag", field: "ITEM_IS_TEMPLATE", default: false },
        weight: { kind: "number", field: "ITEM_WEIGHT", scale: 2 },
        costGp: { kind: "number", field: "ITEM_COST_GP", scale: 2 },
        type: { kind: "text", field: "ITEM_TYPE" },
        slot: { kind: "text", field: "ITEM_SLOT", default: "Other" },
      },
    },
    klasses: {
      columns: {
        hd: { kind: "number", field: "KLASS_HD", integer: true },
        parentId: { kind: "link", role: "subclassOf" },
        kind: { kind: "partition", default: "pc" },
      },
    },
    klass_levels: { columns: { klassId: { kind: "owner" }, level: { kind: "position" } } },
    languages: { columns: { type: { kind: "text", field: "LANGUAGE_TYPE" } } },
    mechanics: { columns: {} },
    powers: {
      columns: {
        saveId: { kind: "link", role: "resistedBy" },
        saveEffect: { kind: "text", field: "POWER_SAVE_EFFECT" },
      },
    },
    races: {
      columns: {
        size: { kind: "text", field: "RACE_SIZE" },
        baseSpeed: { kind: "number", field: "RACE_BASE_SPEED", integer: true },
        parentId: { kind: "link", role: "subraceOf" },
        kind: { kind: "partition", default: "pc" },
      },
    },
    saves: { columns: { abilityId: { kind: "link", role: "keyAbility" } } },
    skills: { columns: { primaryAbilityId: { kind: "link", role: "keyAbility" } } },
  },
  joins: {
    feats_aptitudes: {
      role: "listedIn",
      from: "feats",
      to: "aptitudes",
      columns: { featId: "from", aptitudeId: "to" },
    },
    powers_aptitudes: {
      role: "listedIn",
      from: "powers",
      to: "aptitudes",
      columns: { powerId: "from", aptitudeId: "to", level: "tier" },
    },
    klass_skills: { role: "classSkill", from: "klasses", to: "skills", columns: { klassId: "from", skillId: "to" } },
    klass_level_feats: {
      role: "grants",
      from: "klass_levels",
      to: "feats",
      columns: { id: "id", klassLevelId: "from", featId: "to", aptitudeId: "via", free: "free" },
    },
    klass_level_powers: {
      role: "grants",
      from: "klass_levels",
      to: "powers",
      columns: { klassLevelId: "from", powerId: "to", aptitudeId: "via", free: "free" },
    },
    klass_level_saves: {
      role: "baseBonus",
      from: "klass_levels",
      to: "saves",
      columns: { klassLevelId: "from", saveId: "to", base: "amount" },
    },
  },
  linkedProperties: {
    entities: { klasses: { KLASS_BONUS_SPELL_ABILITY_ID: "bonusSpellAbility" } },
    rulesets: { RULESET_SKILL_POINT_ABILITY_ID: "skillPointAbility" },
  },
  character: {
    columns: {
      raceId: { kind: "link", role: "race" },
      xp: { kind: "number", field: "CHARACTER_XP" },
      alignment: { kind: "text", field: "CHARACTER_ALIGNMENT" },
      age: { kind: "number", field: "CHARACTER_AGE" },
      gender: { kind: "text", field: "CHARACTER_GENDER" },
      height: { kind: "text", field: "CHARACTER_HEIGHT" },
      weight: { kind: "text", field: "CHARACTER_WEIGHT" },
      deity: { kind: "text", field: "CHARACTER_DEITY" },
    },
    links: {
      abilities: { role: "score", entity: "abilityId", amount: "score" },
      languages: { role: "speaks", entity: "languageId" },
    },
    advancement: { track: "klassLevelId", value: { step: "hp", column: "hp" } },
    picks: {
      abilityIncreases: { step: "abilities", entity: "abilityId", amount: "amount" },
      skills: { step: "skills", entity: "skillId", amount: "rank" },
      feats: { step: "feats", entity: "featId", via: "aptitudeId", id: true },
      powers: { step: "powers", entity: "powerId", via: "aptitudeId" },
    },
  },
  registries: {
    entityTypes: [
      ...[
        "abilities",
        "saves",
        "skills",
        "feats",
        "powers",
        "items",
        "races",
        "languages",
        "klasses",
        "aptitudes",
        "mechanics",
      ].map((type) => ({ type, ownerType: null })),
      { type: "klass_levels", ownerType: "klasses" },
    ],
    linkRoles: [
      { role: "subraceOf", fromType: "races", toType: "races", viaType: null, single: true, onDelete: "delete" },
      { role: "subclassOf", fromType: "klasses", toType: "klasses", viaType: null, single: true, onDelete: "delete" },
      { role: "madeFrom", fromType: "items", toType: "items", viaType: null, single: true, onDelete: "refuse" },
      { role: "listedIn", fromType: "feats", toType: "aptitudes", viaType: null, single: false, onDelete: "unlink" },
      { role: "listedIn", fromType: "powers", toType: "aptitudes", viaType: null, single: false, onDelete: "unlink" },
      { role: "classSkill", fromType: "klasses", toType: "skills", viaType: null, single: false, onDelete: "unlink" },
      {
        role: "grants",
        fromType: "klass_levels",
        toType: "feats",
        viaType: "aptitudes",
        single: false,
        onDelete: "unlink",
      },
      {
        role: "grants",
        fromType: "klass_levels",
        toType: "powers",
        viaType: "aptitudes",
        single: false,
        onDelete: "unlink",
      },
      {
        role: "baseBonus",
        fromType: "klass_levels",
        toType: "saves",
        viaType: null,
        single: false,
        onDelete: "refuse",
      },
      { role: "keyAbility", fromType: "saves", toType: "abilities", viaType: null, single: true, onDelete: "delete" },
      { role: "keyAbility", fromType: "skills", toType: "abilities", viaType: null, single: true, onDelete: "delete" },
      { role: "resistedBy", fromType: "powers", toType: "saves", viaType: null, single: true, onDelete: "unlink" },
      {
        role: "bonusSpellAbility",
        fromType: "klasses",
        toType: "abilities",
        viaType: null,
        single: true,
        onDelete: "unlink",
      },
    ].map((role) => ({
      ...(role as Omit<StorageDeclaration["registries"]["linkRoles"][number], "merge" | "viaOnDelete">),
      viaOnDelete: role.viaType ? "unlink" : "refuse",
      merge: role.role === "listedIn" ? "union" : role.role === "bonusSpellAbility" ? "fallback" : "winner",
    })),
    fieldDefs: [
      ...COLUMN_FIELDS.map(([ownerType, field, valueKind]): FieldDef => ({
        ownerKind: ownerKindOf(ownerType),
        ownerType,
        field,
        valueKind,
        multiple: false,
        merge: "winner",
        inheritsVia: null,
      })),
      ...PROPERTY_FIELDS.map(([ownerType, field, valueKind, multiple, inherits]): FieldDef => ({
        ownerKind: ownerKindOf(ownerType),
        ownerType,
        field,
        valueKind,
        multiple,
        merge: propertyMerge(ownerType, multiple),
        inheritsVia: inherits ? "madeFrom" : null,
      })),
    ],
    rulesetRoles: [{ role: "skillPointAbility", toType: "abilities", onDelete: "unlink" }],
    characterRoles: [
      { role: "race", entityType: "races", single: true, onDelete: "refuse" },
      { role: "score", entityType: "abilities", single: false, onDelete: "delete" },
      { role: "speaks", entityType: "languages", single: false, onDelete: "refuse" },
    ],
    steps: [
      { step: "hp", entityType: null, viaType: null, onDelete: "refuse", repeats: false },
      { step: "abilities", entityType: "abilities", viaType: null, onDelete: "delete", repeats: false },
      { step: "skills", entityType: "skills", viaType: null, onDelete: "refuse", repeats: false },
      { step: "feats", entityType: "feats", viaType: "aptitudes", onDelete: "refuse", repeats: true },
      { step: "powers", entityType: "powers", viaType: "aptitudes", onDelete: "refuse", repeats: false },
    ],
    itemTypes: ["items"],
  },
};
