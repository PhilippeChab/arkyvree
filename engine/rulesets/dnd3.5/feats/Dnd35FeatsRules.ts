import type { FeatFields, FeatsRules } from "@/engine/rulesets/dnd3.5/module/index.ts";

import { readFeatFields } from "./featFields.ts";

export class Dnd35FeatsRules implements FeatsRules {
  readProperties(properties: { type: string; value: string }[]): FeatFields {
    return readFeatFields(properties);
  }
}
