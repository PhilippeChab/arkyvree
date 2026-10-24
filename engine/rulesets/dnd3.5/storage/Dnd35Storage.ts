import type { StorageDeclaration } from "@/engine/core/module/index.ts";

import Dnd35FieldDefs from "./Dnd35FieldDefs.ts";

/**
 * How 3.5 stores its data in the generic tables: its kinds' columns (a class's hit die is its `KLASS_HD` field, a
 * save's ability its `keyAbility` link), its joins (a feat's pools are its `listedIn` links), its characters' (a race is
 * a `race` link, a level an advancement, its feats `feats` picks), and its registries' rows, which migration 0080 wrote
 * (`tests/database/registries.test.ts` checks the database holds them).
 */
export const DND35_STORAGE: StorageDeclaration = {
  kinds: {
    abilities: { columns: {} },
    aptitudes: { columns: {}, namesakes: "identity" },
    feats: {
      columns: {
        stackable: { kind: "flag", field: "FEAT_STACKABLE", default: false },
        selectable: { kind: "flag", field: "FEAT_SELECTABLE", default: true },
        generated: { kind: "flag", field: "FEAT_GENERATED", default: false },
      },
      lists: { featsAptitudesInRules: { join: "feats_aptitudes", target: "aptitudesInRule" } },
      namesakes: "reprints",
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
      order: [
        ...["createdAt", "updatedAt", "deletedAt", "id", "rulesetId", "campaignId", "sourceItemId", "isTemplate"],
        ...["name", "description", "weight", "costGp", "type", "slot"],
      ],
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
      lists: { powersAptitudesInRules: { join: "powers_aptitudes", target: "aptitudesInRule" } },
      namesakes: "reprints",
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
    order: [
      ...["createdAt", "updatedAt", "deletedAt", "id", "userId", "rulesetId", "raceId", "kind", "parentCharacterId"],
      ...["xp", "name", "alignment", "age", "gender", "height", "weight", "deity", "description", "notes"],
      ...["privateNotes", "shareToken", "lastChangedAt"],
    ],
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
    fieldDefs: Dnd35FieldDefs.build(),
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
