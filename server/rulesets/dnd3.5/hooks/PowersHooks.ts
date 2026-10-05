import type { Db } from "@/server/database/index.ts";
import type { PowerBody, PowersHooks } from "@/server/rulesets/hooks/index.ts";
import { SPELL_SCHOOL } from "@/shared/dnd3.5/properties/index.ts";

import {
  generateSpellFocusFeats,
  generateSpellProperties,
  SPELL_FIELD_PROPERTY_TYPES,
  type SpellFields,
} from "./generators/spellGenerator.ts";

export class Dnd35PowersHooks implements PowersHooks {
  readonly primaryGroupingType = SPELL_SCHOOL;

  readonly generatedPropertyTypes = SPELL_FIELD_PROPERTY_TYPES;

  private extractSpellFields(body: PowerBody): SpellFields | null {
    if (typeof body.school !== "string" || body.school.length === 0) return null;
    return {
      school: body.school,
      subschool: body.subschool,
      descriptors: body.descriptors,
      castingTime: body.castingTime,
      rangeType: body.rangeType,
      target: body.target,
      areaOfEffect: body.areaOfEffect,
      duration: body.duration,
      spellResistance: body.spellResistance,
      components: body.components,
    };
  }

  extractGroupingValue(body: PowerBody): string | null {
    return typeof body.school === "string" && body.school.length > 0 ? body.school : null;
  }

  async generateGroupingFeats(tx: Db, rulesetId: string, sourceChain: string[], value: string): Promise<void> {
    await generateSpellFocusFeats(tx, rulesetId, sourceChain, value);
  }

  async generateProperties(tx: Db, powerId: string, body: PowerBody): Promise<void> {
    const fields = this.extractSpellFields(body);
    if (!fields) return;
    await generateSpellProperties(tx, powerId, fields);
  }
}
