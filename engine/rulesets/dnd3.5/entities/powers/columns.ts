import type { FormField } from "@/engine/core/fields/index.ts";
import type { ListDescription } from "@/engine/core/module/index.ts";
import { APTITUDES_REQUIRED } from "@/engine/rulesets/dnd3.5/entities/aptitudes/refusals.ts";
import { RULESET_LIMITS } from "@/engine/rulesets/dnd3.5/limits.ts";

/**
 * A 3.5 spell's columns, as its form shows them beside its name and description: its saving throw and what a save
 * does, then, after its fields, its spell lists, each at its spell level (`SPELL_LEVEL` holds them; a new spell needs
 * one).
 */
export const POWER_COLUMNS: FormField[] = [
  {
    help: "The save it allows",
    input: "ref",
    key: "saveId",
    label: "Saving Throw",
    references: "saves",
    required: false,
  },
  {
    help: "What a successful save does",
    input: "text",
    key: "saveEffect",
    label: "Save Effect",
    multiple: false,
    nullable: true,
    placeholder: 'e.g., "negates", "half", "partial"',
  },
  {
    help: "The spell lists it's on, each at its spell level",
    input: "leveledLinks",
    key: "aptitudes",
    links: "powersAptitudesInRules",
    label: "Aptitudes",
    max: RULESET_LIMITS.spellLevel,
    min: 0,
    references: "aptitudes",
    required: APTITUDES_REQUIRED,
    target: "aptitudesInRule",
  },
];

/** A 3.5 spell's list: its name, its spell lists, its description. */
export const POWER_LIST: ListDescription = {
  nameShare: 25,
  columns: [
    {
      key: "powersAptitudesInRules",
      label: "Aptitudes",
      reads: "pools",
      share: 15,
      slot: "inline",
      target: "aptitudesInRule",
    },
  ],
};
