import type { PropertiesWrite } from "@/engine/core/module/index.ts";
import type { ClassesEffects, ClassFields } from "@/engine/rulesets/dnd3.5/module/index.ts";

import { CLASS_FIELD_PROPERTY_TYPES, toClassProperties } from "./classFields.ts";

export class Dnd35ClassesEffects implements ClassesEffects {
  properties(klassId: string, fields: ClassFields): PropertiesWrite {
    return {
      entityId: klassId,
      entityType: "klasses",
      types: CLASS_FIELD_PROPERTY_TYPES,
      rows: toClassProperties(klassId, fields),
    };
  }
}
