import type { RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";
import type { PowerBody, PowersEffects } from "@/server/rulesets/engine/module/index.ts";

import { generateSpellFocusFeats, generateSpellProperties, type SpellFields } from "./spellGenerator.ts";

export class Dnd35PowersEffects implements PowersEffects {
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

  async generateGroupingFeats(tx: Db, scope: RulesetScope, value: string): Promise<void> {
    await generateSpellFocusFeats(tx, scope.ruleset.id, scope.rulesetData.cow.sourceChain, value);
  }

  async generateProperties(tx: Db, powerId: string, body: PowerBody): Promise<void> {
    const fields = this.extractSpellFields(body);
    if (!fields) return;
    await generateSpellProperties(tx, powerId, fields);
  }
}
