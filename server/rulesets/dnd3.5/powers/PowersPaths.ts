import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";

/** The spells' target paths: each spell's DC, possession and properties. */
export default class PowersPaths implements PathCategory {
  readonly name = "powers";
  readonly label = "Spells";
  readonly description = "Spell DC, possession, and properties";
  readonly holder = { key: "powers", getter: "getPowers" };
  readonly groupDescriptionTemplates = { powers: "{name} spell DC and properties" };
}
