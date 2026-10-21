import type { FormField } from "@/engine/core/fields/index.ts";
import type { ListDescription } from "@/engine/core/module/index.ts";

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

/** A 3.5 skill's list: its name, its primary ability, whether it's trained only, its description. */
export const SKILL_LIST: ListDescription = {
  nameShare: 25,
  columns: [
    { key: "primaryAbilityId", label: "Primary Ability", reads: "reference", references: "abilities", share: 15 },
    { key: "usableWithoutTraining", label: "Trained Only", reads: "flag", share: 15, yesWhen: false },
  ],
};
