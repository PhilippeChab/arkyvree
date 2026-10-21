import type { FormField } from "@/engine/core/fields/index.ts";

/** A 3.5 skill's columns, as its form shows them beside its name and description: the ability it's checked with. */
export const SKILL_COLUMNS: FormField[] = [
  {
    help: "The ability its checks add",
    input: "ref",
    key: "primaryAbilityId",
    label: "Primary Ability",
    references: "abilities",
    required: true,
  },
];
