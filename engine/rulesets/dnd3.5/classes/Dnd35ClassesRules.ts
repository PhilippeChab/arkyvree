import type { ClassesRules, ClassFields } from "@/engine/core/module/index.ts";
import { KLASS_BONUS_SPELL_ABILITY_ID, KLASS_CASTER_TYPE } from "@/shared/dnd3.5/properties/index.ts";

import { readClassFields } from "./classFields.ts";

export class Dnd35ClassesRules implements ClassesRules {
  getPropertyIds(properties: { id: string; type: string }[]): Record<keyof ClassFields, string | null> {
    const idOf = (type: string) => properties.find((property) => property.type === type)?.id ?? null;
    return { bonusSpellAbilityId: idOf(KLASS_BONUS_SPELL_ABILITY_ID), casterType: idOf(KLASS_CASTER_TYPE) };
  }

  readProperties(properties: { type: string; value: string }[]): ClassFields {
    return readClassFields(properties);
  }
}
