import type { ClassesHooks } from "@/server/rulesets/hooks/ClassesHooks.ts";
import { KLASS_BONUS_SPELL_ABILITY_ID, KLASS_CASTER_TYPE } from "@/server/rulesets/dnd3.5/properties/index.ts";

export class Dnd35ClassesHooks implements ClassesHooks {
  readClassProperties(
    properties: { id: string; type: string; value: string }[],
  ) {
    const bonusSpellProperty = properties.find((p) => p.type === KLASS_BONUS_SPELL_ABILITY_ID);
    const casterTypeProperty = properties.find((p) => p.type === KLASS_CASTER_TYPE);

    return {
      bonusSpellAbilityId: bonusSpellProperty?.value ?? null,
      bonusSpellPropertyId: bonusSpellProperty?.id ?? null,
      casterTypeValue: casterTypeProperty?.value ?? null,
      casterTypePropertyId: casterTypeProperty?.id ?? null,
    };
  }
}
