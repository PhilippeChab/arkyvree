import type { PropertiesWrite, RequirementWrite } from "@/engine/core/module/index.ts";
import type { ClassLevelFields, ClassLevelsEffects } from "@/engine/rulesets/dnd3.5/module/index.ts";

import ClassesPaths from "./ClassesPaths.ts";
import { CLASS_LEVEL_FIELD_PROPERTY_TYPES, toClassLevelProperties } from "./classLevelFields.ts";

export class Dnd35ClassLevelsEffects implements ClassLevelsEffects {
  /** A level past a class's first requires the class's previous level: `classes.<slug>.level` above it. */
  previousLevelRequirement(klassLevel: { id: string; level: number }, className: string): RequirementWrite | undefined {
    if (klassLevel.level <= 1) return undefined;
    return {
      entityId: klassLevel.id,
      entityType: "klass_levels",
      level: "1",
      target: ClassesPaths.level(className),
      value: (klassLevel.level - 1).toString(),
      valueType: "number",
      operator: "greater_than",
    };
  }

  properties(levelId: string, fields: ClassLevelFields): PropertiesWrite {
    return {
      entityId: levelId,
      entityType: "klass_levels",
      types: CLASS_LEVEL_FIELD_PROPERTY_TYPES,
      rows: toClassLevelProperties(levelId, fields),
    };
  }
}
