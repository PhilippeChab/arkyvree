import type { Db } from "@/server/database/index.ts";
import { Properties, Requirements } from "@/server/repositories/index.ts";
import type { ClassLevelFields, ClassLevelsEffects } from "@/server/rulesets/engine/module/index.ts";

import ClassesPaths from "./ClassesPaths.ts";
import { CLASS_LEVEL_FIELD_PROPERTY_TYPES, toClassLevelProperties } from "./classLevelFields.ts";

export class Dnd35ClassLevelsEffects implements ClassLevelsEffects {
  /** A level past a class's first requires the class's previous level: `classes.<slug>.level` above it. */
  async requirePreviousLevel(tx: Db, klassLevel: { id: string; level: number }, className: string): Promise<void> {
    if (klassLevel.level > 1) {
      await Requirements.create(tx, {
        entityId: klassLevel.id,
        entityType: "klass_levels",
        level: "1",
        target: ClassesPaths.level(className),
        value: (klassLevel.level - 1).toString(),
        valueType: "number",
        operator: "greater_than",
      });
    }
  }

  async syncProperties(tx: Db, levelId: string, fields: ClassLevelFields): Promise<void> {
    await Properties.delete(tx, {
      entityIds: [levelId],
      entityType: "klass_levels",
      types: CLASS_LEVEL_FIELD_PROPERTY_TYPES,
    });

    await Properties.createMany(tx, toClassLevelProperties(levelId, fields));
  }
}
