import type { FormField } from "@/engine/core/fields/index.ts";
import type { ListDescription } from "@/engine/core/module/index.ts";
import { SKILL_USABLE_WITHOUT_TRAINING } from "@/vocabulary/dnd3.5/fields/index.ts";

/** A 3.5 skill's columns, as its form shows them beside its name and description: the ability it's checked with. */
export const SKILL_COLUMNS: FormField[] = [
  {
    help: "The ability its checks add",
    input: "ref",
    label: "Primary Ability",
    references: "abilities",
    required: true,
    role: "keyAbility",
  },
];

/** A 3.5 skill's list: its name, its primary ability, whether it's trained only, its description. */
export const SKILL_LIST: ListDescription = {
  nameShare: 25,
  columns: [
    {
      label: "Primary Ability",
      reads: "reference",
      references: "abilities",
      role: "keyAbility",
      share: 15,
    },
    {
      field: SKILL_USABLE_WITHOUT_TRAINING,
      label: "Trained Only",
      reads: "flag",
      share: 15,
      yesWhen: false,
    },
  ],
};
