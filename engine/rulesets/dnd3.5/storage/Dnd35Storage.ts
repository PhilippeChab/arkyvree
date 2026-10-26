import type { StorageDeclaration } from "@/engine/core/module/index.ts";
import {
  CLASS_HD,
  FEAT_GENERATED,
  FEAT_SELECTABLE,
  FEAT_STACKABLE,
  ITEM_COST_GP,
  ITEM_IS_TEMPLATE,
  ITEM_SLOT,
  ITEM_TYPE,
  ITEM_WEIGHT,
  LANGUAGE_TYPE,
  RACE_BASE_SPEED,
  RACE_SIZE,
  SPELL_SAVE_EFFECT,
} from "@/vocabulary/dnd3.5/fields/index.ts";

import Dnd35FieldDefs from "./Dnd35FieldDefs.ts";

/**
 * 3.5's kinds: each one's own fields (a class's hit die, `CLASS_HD`; a feat's flags, a feat picked at a level up by
 * default; an item's cost, weight, type and slot, `"Other"` by default, and whether it's a template), what a new class
 * or race is for by default (`pc`), and which kinds a user customizes and how their namesakes pair.
 */
const KINDS: StorageDeclaration["kinds"] = {
  abilities: {},
  aptitudes: { namesakes: "identity" },
  feats: {
    customizable: true,
    fields: {
      [FEAT_STACKABLE]: { kind: "flag", default: false },
      [FEAT_SELECTABLE]: { kind: "flag", default: true },
      [FEAT_GENERATED]: { kind: "flag", default: false },
    },
    namesakes: "reprints",
  },
  items: {
    customizable: true,
    fields: {
      [ITEM_WEIGHT]: { kind: "number", scale: 2 },
      [ITEM_COST_GP]: { kind: "number", scale: 2 },
      [ITEM_TYPE]: { kind: "text" },
      [ITEM_SLOT]: { kind: "text", default: "Other" },
      [ITEM_IS_TEMPLATE]: { kind: "flag", default: false },
    },
    template: ITEM_IS_TEMPLATE,
  },
  classes: {
    customizable: true,
    editedLinks: "classSkill",
    fields: { [CLASS_HD]: { kind: "number" } },
    partition: "pc",
  },
  class_levels: { customizable: true },
  languages: { fields: { [LANGUAGE_TYPE]: { kind: "text" } } },
  mechanics: {},
  spells: { customizable: true, fields: { [SPELL_SAVE_EFFECT]: { kind: "text" } }, namesakes: "reprints" },
  races: {
    customizable: true,
    fields: { [RACE_SIZE]: { kind: "text" }, [RACE_BASE_SPEED]: { kind: "number" } },
    partition: "pc",
  },
  saves: {},
  skills: {},
};

/**
 * How 3.5 stores its data in the generic tables: its kinds (`KINDS`: their own fields, a save's ability its
 * `keyAbility` link), its characters' (its links of the `score` role hold an amount; its identity is its `CHARACTER_*`
 * fields, its race a `race` link, a level an advancement, its feats `feats` picks), and its registries' rows, which
 * migration 0080 wrote (`tests/database/dnd3.5/registries.test.ts` checks the database holds them): its link roles
 * among them, by which its entities' links are read (an item's template is its `madeFrom` link, a feat's pools its
 * `listedIn` links, a class's skills its `classSkill` links).
 */
export const DND35_STORAGE: StorageDeclaration = {
  kinds: KINDS,
  character: { scoredRoles: ["score"] },
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
    fieldDefs: Dnd35FieldDefs.build(KINDS),
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
