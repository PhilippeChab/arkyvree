import type { PowerFields } from "@/engine/core/module/rules/index.ts";

import type { GeneratedFeatsWrite, PropertiesWrite } from "./writes.ts";

/** What a ruleset writes when a power is saved: its fields, and the feats of its grouping. */
export interface PowersEffects {
  /**
   * The feats a grouping (a spell's school) brings, unless the ruleset or its chain has them. Every power of the
   * grouping shares them, so none goes with a power.
   */
  generatedFeats(grouping: string): GeneratedFeatsWrite;
  /** The power's fields, as the properties stored in place of those it stored before; its other properties stay. */
  properties(powerId: string, fields: PowerFields): PropertiesWrite;
}
