import type { PropertiesWrite } from "@/engine/core/module/index.ts";
import type { RaceFields } from "@/engine/rulesets/dnd3.5/module/rules/index.ts";

/** What a ruleset writes when a race is saved: its fields. */
export interface RacesEffects {
  /** The race's fields, as the properties stored in place of those it stored before. */
  properties(raceId: string, fields: RaceFields): PropertiesWrite;
}
