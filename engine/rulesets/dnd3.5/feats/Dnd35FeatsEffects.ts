import type { PropertiesWrite } from "@/engine/core/module/index.ts";
import type { FeatFields, FeatsEffects } from "@/engine/rulesets/dnd3.5/module/index.ts";

import { FEAT_FIELD_PROPERTY_TYPES, toFeatProperties } from "./featFields.ts";

export class Dnd35FeatsEffects implements FeatsEffects {
  properties(featId: string, fields: FeatFields): PropertiesWrite {
    return {
      entityId: featId,
      entityType: "feats",
      types: FEAT_FIELD_PROPERTY_TYPES,
      rows: toFeatProperties(featId, fields),
    };
  }
}
