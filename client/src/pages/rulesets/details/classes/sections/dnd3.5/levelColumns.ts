import type { ClassLevelColumns } from "@/client/src/pages/rulesets/details/classes/classSectionFactory.ts";
import { formatSigned } from "@/shared/text.ts";

/** A 3.5 level's own columns on its Levels tab: its base attack bonus before the saves, its skill points after them. */
export const DND35_LEVEL_COLUMNS: ClassLevelColumns = {
  beforeSaves: [{ key: "bab", label: "Base Attack Bonus", share: 15, valueOf: (level) => formatSigned(level.bab) }],
  afterSaves: [{ key: "skills", label: "Skill Points", share: 13, valueOf: (level) => level.skills }],
};
