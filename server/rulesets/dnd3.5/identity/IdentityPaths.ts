import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";

/** The identity's target paths: physiology, beliefs, background, level and XP. */
export default class IdentityPaths implements PathCategory {
  readonly name = "identity";
  readonly label = "Identity";
  readonly description = "Physiology, level, XP, and background";
  readonly holder = { key: "identity", getter: "getIdentity" };
  readonly pathDescriptions = {
    "identity.physiology": "Character name, description, age, gender, height, weight",
    "identity.beliefs": "Deity and alignment",
    "identity.background": "Notes and private notes",
    "identity.meta": "Character level and experience points",
    "identity.physiology.race": "Character race name and size",
  };
}
