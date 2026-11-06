import type { ListDeclaration } from "@/engine/core/module/index.ts";
import { SKILL_USABLE_WITHOUT_TRAINING } from "@/vocabulary/pf1/fields/index.ts";

/** A Pathfinder skill's list: its name, its primary ability, whether it's trained only, its description. */
export const SKILL_LIST: ListDeclaration = {
  nameShare: 25,
  columns: [
    { reads: "reference", role: "keyAbility", share: 15 },
    {
      field: SKILL_USABLE_WITHOUT_TRAINING,
      label: "Trained Only",
      reads: "flag",
      share: 15,
      yesWhen: false,
    },
  ],
};
