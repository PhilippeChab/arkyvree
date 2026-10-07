import type { RaceFields, RacesRules } from "@/engine/core/module/index.ts";

import { readRaceFields } from "./raceFields.ts";

export class Dnd35RacesRules implements RacesRules {
  readProperties(properties: { type: string; value: string }[]): RaceFields {
    return readRaceFields(properties);
  }
}
