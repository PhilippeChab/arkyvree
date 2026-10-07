import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";

/** The feats' target paths: each feat's possession and count, and its family's. */
export default class FeatsPaths implements PathCategory {
  readonly name = "feats";
  readonly label = "Feats";
  readonly description = "Feat possession and stackable count";
  readonly holder = { key: "feats", getter: "getFeats" };
  readonly groupDescriptionTemplates = { feats: "{name} feat possession" };
}
