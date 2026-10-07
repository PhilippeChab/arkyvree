import type { PathCategory } from "@/server/rulesets/engine/paths/PathCategory.ts";

/** The aptitudes' target paths: each aptitude's uses and slots. */
export default class AptitudesPaths implements PathCategory {
  readonly name = "aptitudes";
  readonly label = "Aptitudes";
  readonly description = "Uses and selection slots";
  readonly holder = { key: "aptitudes", getter: "getAptitudes" };
  readonly groupDescriptionTemplates = { aptitudes: "{name} uses and slots" };
}
