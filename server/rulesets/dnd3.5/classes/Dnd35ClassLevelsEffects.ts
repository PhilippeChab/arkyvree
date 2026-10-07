import type { Db } from "@/server/database/index.ts";
import { Properties, Requirements } from "@/server/repositories/index.ts";
import type { PropertyRecord } from "@/server/rulesets/dnd3.5/types.ts";
import type { ClassLevelFields, ClassLevelsEffects } from "@/server/rulesets/engine/module/index.ts";
import { KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS } from "@/shared/dnd3.5/properties/index.ts";

import ClassesPaths from "./ClassesPaths.ts";

export class Dnd35ClassLevelsEffects implements ClassLevelsEffects {
  private buildProperties(levelId: string, fields: ClassLevelFields): PropertyRecord[] {
    const { bab, skills } = fields;

    return [
      {
        entityId: levelId,
        entityType: "klass_levels",
        type: KLASS_LEVEL_BAB,
        value: String(bab),
      },
      {
        entityId: levelId,
        entityType: "klass_levels",
        type: KLASS_LEVEL_SKILL_POINTS,
        value: String(skills),
      },
    ];
  }

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
      types: [KLASS_LEVEL_BAB, KLASS_LEVEL_SKILL_POINTS],
    });

    const records = this.buildProperties(levelId, fields);
    await Properties.createMany(tx, records);
  }
}
