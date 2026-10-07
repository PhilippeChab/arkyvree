import type { RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import type { PowerFields, PowersEffects } from "@/server/rulesets/engine/module/index.ts";

import {
  generateSpellFocusFeats,
  generateSpellProperties,
  SPELL_FIELD_PROPERTY_TYPES,
  type SpellFields,
} from "./spellGenerator.ts";

export class Dnd35PowersEffects implements PowersEffects {
  private extractSpellFields(fields: PowerFields): SpellFields | null {
    if (typeof fields.school !== "string" || fields.school.length === 0) return null;
    return {
      school: fields.school,
      subschool: fields.subschool,
      descriptors: fields.descriptors,
      castingTime: fields.castingTime,
      rangeType: fields.rangeType,
      target: fields.target,
      areaOfEffect: fields.areaOfEffect,
      duration: fields.duration,
      spellResistance: fields.spellResistance,
      components: fields.components,
    };
  }

  async generateFeats(tx: Db, scope: RulesetScope, grouping: string): Promise<void> {
    await generateSpellFocusFeats(tx, scope, grouping);
  }

  /** A spell's fields, as properties: none without a school. */
  async syncProperties(tx: Db, powerId: string, fields: PowerFields): Promise<void> {
    await Properties.delete(tx, { entityIds: [powerId], entityType: "powers", types: SPELL_FIELD_PROPERTY_TYPES });

    const spellFields = this.extractSpellFields(fields);
    if (spellFields) await generateSpellProperties(tx, powerId, spellFields);
  }
}
