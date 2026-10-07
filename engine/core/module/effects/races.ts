import type { RaceFields } from "@/engine/core/module/rules/index.ts";

import type { PropertiesWrite } from "./writes.ts";

/** What a ruleset writes when a race is saved: its fields. */
export interface RacesEffects {
  /** The race's fields, as the properties stored in place of those it stored before. */
  properties(raceId: string, fields: RaceFields): PropertiesWrite;
}
