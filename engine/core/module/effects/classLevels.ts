import type { ClassLevelFields } from "@/engine/core/module/rules/index.ts";

import type { PropertiesWrite, RequirementWrite } from "./writes.ts";

/** What a ruleset writes when a class level is saved: its fields, and what it requires of the class's earlier levels. */
export interface ClassLevelsEffects {
  /** What a level past the class's first requires of the class's earlier levels: none for its first. */
  previousLevelRequirement(klassLevel: { id: string; level: number }, className: string): RequirementWrite | undefined;
  /** The level's fields, as the properties stored in place of those it stored before. */
  properties(levelId: string, fields: ClassLevelFields): PropertiesWrite;
}
