import type { StorageDeclaration } from "@/engine/core/module/index.ts";

import Dnd35FieldDefs from "./Dnd35FieldDefs.ts";

/**
 * How 3.5 stores its data in the generic tables: its kinds' columns (a class's hit die is its `CLASS_HD` field, a
 * save's ability its `keyAbility` link), its characters' (a race is a `race` link, a level an advancement, its feats
 * `feats` picks), and its registries' rows, which migration 0080 wrote (`tests/database/dnd3.5/registries.test.ts`
 * checks the database holds them): its link roles among them, by which its entities' links are read (a feat's pools
 * are its `listedIn` links, a class's skills its `classSkill` links).
 */
export const DND35_STORAGE: StorageDeclaration = {
  kinds: {
    abilities: { columns: {} },
    aptitudes: { columns: {}, namesakes: "identity" },
    feats: {
      customizable: true,
      columns: {
        stackable: { kind: "flag", field: "FEAT_STACKABLE", default: false },
        selectable: { kind: "flag", field: "FEAT_SELECTABLE", default: true },
        generated: { kind: "flag", field: "FEAT_GENERATED", default: false },
      },
      namesakes: "reprints",
    },
    items: {
      customizable: true,
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
    classes: {
      customizable: true,
      columns: {
        hd: { kind: "number", field: "CLASS_HD", integer: true },
        parentId: { kind: "link", role: "subclassOf" },
        kind: { kind: "partition", default: "pc" },
      },
      editedLinks: "classSkill",
    },
    class_levels: { customizable: true, columns: { klassId: { kind: "owner" }, level: { kind: "position" } } },
    languages: { columns: { type: { kind: "text", field: "LANGUAGE_TYPE" } } },
    mechanics: { columns: {} },
    spells: {
      customizable: true,
      columns: {
        saveId: { kind: "link", role: "resistedBy" },
        saveEffect: { kind: "text", field: "SPELL_SAVE_EFFECT" },
      },
      namesakes: "reprints",
    },
    races: {
      customizable: true,
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
  },
  registries: {
    entityTypes: [
      ...[
        "abilities",
        "saves",
        "skills",
        "feats",
        "spells",
        "items",
        "races",
        "languages",
        "classes",
        "aptitudes",
        "mechanics",
      ].map((type) => ({ type, ownerType: null })),
      { type: "class_levels", ownerType: "classes" },
    ],
    linkRoles: [
      { role: "subraceOf", fromType: "races", toType: "races", viaType: null, single: true, onDelete: "delete" },
      { role: "subclassOf", fromType: "classes", toType: "classes", viaType: null, single: true, onDelete: "delete" },
      { role: "madeFrom", fromType: "items", toType: "items", viaType: null, single: true, onDelete: "refuse" },
      { role: "listedIn", fromType: "feats", toType: "aptitudes", viaType: null, single: false, onDelete: "unlink" },
      { role: "listedIn", fromType: "spells", toType: "aptitudes", viaType: null, single: false, onDelete: "unlink" },
      { role: "classSkill", fromType: "classes", toType: "skills", viaType: null, single: false, onDelete: "unlink" },
      {
        role: "grants",
        fromType: "class_levels",
        toType: "feats",
        viaType: "aptitudes",
        single: false,
        onDelete: "unlink",
      },
      {
        role: "grants",
        fromType: "class_levels",
        toType: "spells",
        viaType: "aptitudes",
        single: false,
        onDelete: "unlink",
      },
      {
        role: "baseBonus",
        fromType: "class_levels",
        toType: "saves",
        viaType: null,
        single: false,
        onDelete: "refuse",
      },
      { role: "keyAbility", fromType: "saves", toType: "abilities", viaType: null, single: true, onDelete: "delete" },
      { role: "keyAbility", fromType: "skills", toType: "abilities", viaType: null, single: true, onDelete: "delete" },
      { role: "resistedBy", fromType: "spells", toType: "saves", viaType: null, single: true, onDelete: "unlink" },
      {
        role: "bonusSpellAbility",
        fromType: "classes",
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
      { step: "spells", entityType: "spells", viaType: "aptitudes", onDelete: "refuse", repeats: false },
    ],
    itemTypes: ["items"],
  },
};
