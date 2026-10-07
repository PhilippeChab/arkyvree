import type { Db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import type { PropertyRecord } from "@/server/rulesets/dnd3.5/types.ts";
import type { ClassesEffects, ClassFields } from "@/server/rulesets/engine/module/index.ts";
import { KLASS_BONUS_SPELL_ABILITY_ID, KLASS_CASTER_TYPE } from "@/shared/dnd3.5/properties/index.ts";

import { CLASS_FIELD_PROPERTY_TYPES } from "./classFields.ts";

export class Dnd35ClassesEffects implements ClassesEffects {
  /** A property for each field the class has: a class without them casts no spells. */
  private buildProperties(klassId: string, fields: ClassFields): PropertyRecord[] {
    const property = (type: string, value: string): PropertyRecord => ({
      entityId: klassId,
      entityType: "klasses",
      type,
      value,
    });
    return [
      ...(fields.bonusSpellAbilityId ? [property(KLASS_BONUS_SPELL_ABILITY_ID, fields.bonusSpellAbilityId)] : []),
      ...(fields.casterType ? [property(KLASS_CASTER_TYPE, fields.casterType)] : []),
    ];
  }

  async syncProperties(tx: Db, klassId: string, fields: ClassFields): Promise<void> {
    await Properties.delete(tx, { entityIds: [klassId], entityType: "klasses", types: CLASS_FIELD_PROPERTY_TYPES });

    const records = this.buildProperties(klassId, fields);
    if (records.length > 0) await Properties.createMany(tx, records);
  }
}
