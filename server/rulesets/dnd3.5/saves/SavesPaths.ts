import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";

/** The saving throws' target paths: each save's components. */
export default class SavesPaths implements PathCategory {
  readonly name = "saves";
  readonly label = "Saving Throws";
  readonly description = "Fortitude, Reflex, and Will saving throws";
  readonly holder = { key: "savingThrows", getter: "getSavingThrows" };
  readonly groupDescriptionTemplates = { saves: "{name} saving throw components" };
}
