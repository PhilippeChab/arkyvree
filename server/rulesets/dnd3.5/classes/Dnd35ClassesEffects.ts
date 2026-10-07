import type { Db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import type { ClassesEffects, ClassFields } from "@/server/rulesets/engine/module/index.ts";

import { CLASS_FIELD_PROPERTY_TYPES, toClassProperties } from "./classFields.ts";

export class Dnd35ClassesEffects implements ClassesEffects {
  async syncProperties(tx: Db, klassId: string, fields: ClassFields): Promise<void> {
    await Properties.delete(tx, { entityIds: [klassId], entityType: "klasses", types: CLASS_FIELD_PROPERTY_TYPES });

    const records = toClassProperties(klassId, fields);
    if (records.length > 0) await Properties.createMany(tx, records);
  }
}
