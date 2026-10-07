import type { Db } from "@/server/database/index.ts";
import { Properties } from "@/server/repositories/index.ts";
import type { FeatFields, FeatsEffects } from "@/server/rulesets/engine/module/index.ts";

import { FEAT_FIELD_PROPERTY_TYPES, toFeatProperties } from "./featFields.ts";

export class Dnd35FeatsEffects implements FeatsEffects {
  async syncProperties(tx: Db, featId: string, fields: FeatFields): Promise<void> {
    await Properties.delete(tx, { entityIds: [featId], entityType: "feats", types: FEAT_FIELD_PROPERTY_TYPES });

    const records = toFeatProperties(featId, fields);
    if (records.length > 0) await Properties.createMany(tx, records);
  }
}
