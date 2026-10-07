import type { RaceReference } from "@/database/packages/dnd35-from-parser/tools/types/races.ts";

import { buildModifierMapping, detectModifiersOf } from "./modifiers.ts";
import { RaceModifiers } from "./readers/modifiers/RaceModifiers.ts";

export function buildRaceDetected(raw: RaceReference["raw"]): RaceReference["detected"] {
  return detectModifiersOf(raw, (entry) => new RaceModifiers(entry));
}

export function buildRaceMapping(
  raw: RaceReference["raw"],
  detected: RaceReference["detected"],
  overrides: NonNullable<RaceReference["overrides"]>,
): RaceReference["mapping"] {
  return buildModifierMapping(raw, detected, overrides, () => ({}));
}
