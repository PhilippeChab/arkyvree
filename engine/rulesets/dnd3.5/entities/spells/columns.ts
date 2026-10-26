import type { FormField } from "@/engine/core/fields/index.ts";
import type { ListDescription } from "@/engine/core/module/index.ts";
import { APTITUDES_REQUIRED } from "@/engine/rulesets/dnd3.5/entities/aptitudes/refusals.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";
import { SPELL_SAVE_EFFECT } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * A 3.5 spell's columns, as its form shows them beside its name and description: its saving throw and what a save
 * does, then, after its fields, its spell lists, each at its spell level (`SPELL_LEVEL` holds them; a new spell needs
 * one).
 */
export const SPELL_COLUMNS: FormField[] = [
  {
    help: "The save it allows",
    input: "ref",
    label: "Saving Throw",
    references: "saves",
    required: false,
    role: "resistedBy",
  },
  {
    field: SPELL_SAVE_EFFECT,
    help: "What a successful save does",
    input: "text",
    label: "Save Effect",
    multiple: false,
    nullable: true,
    placeholder: 'e.g., "negates", "half", "partial"',
  },
  {
    help: "The spell lists it's on, each at its spell level",
    input: "leveledLinks",
    label: "Aptitudes",
    max: RULESET_LIMITS.spellLevel,
    min: 0,
    references: "aptitudes",
    required: APTITUDES_REQUIRED,
    role: "listedIn",
  },
];

/** A 3.5 spell's list: its name, its spell lists, its description. */
export const SPELL_LIST: ListDescription = {
  nameShare: 25,
  columns: [{ label: "Aptitudes", reads: "pools", role: "listedIn", share: 15, slot: "inline" }],
};
