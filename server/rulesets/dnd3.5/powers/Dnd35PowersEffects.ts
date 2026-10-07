import type { RulesetScope } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import type { PowerFields, PowersEffects } from "@/server/rulesets/engine/module/index.ts";

import { POWER_FIELD_PROPERTY_TYPES, toPowerProperties } from "./powerFields.ts";
import { generateSpellFocusFeats } from "./spellGenerator.ts";

export class Dnd35PowersEffects implements PowersEffects {
  async generateFeats(tx: Db, scope: RulesetScope, grouping: string): Promise<void> {
    await generateSpellFocusFeats(tx, scope, grouping);
  }

  /** A spell's fields, as properties: none without a school. */
  async syncProperties(tx: Db, powerId: string, fields: PowerFields): Promise<void> {
    await Properties.delete(tx, { entityIds: [powerId], entityType: "powers", types: POWER_FIELD_PROPERTY_TYPES });

    const records = toPowerProperties(powerId, fields);
    if (records.length > 0) await Properties.createMany(tx, records);
  }
}
