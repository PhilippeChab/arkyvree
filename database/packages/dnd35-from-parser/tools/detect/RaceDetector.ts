import { sanitizeJsonValues } from "@/database/packages/dnd35-from-parser/tools/text/sanitize.ts";
import type { RaceReference } from "@/database/packages/dnd35-from-parser/tools/types/races.ts";

import { buildModifierMapping, detectModifiersOf } from "./modifiers.ts";
import { RaceModifiers } from "./readers/modifiers/RaceModifiers.ts";

/**
 * A race reference's detector: each race's modifiers (`detected`: its ability adjustments, its traits' bonuses), read
 * from its page sanitized, and its description and modifiers, its overrides applied (`mapping`).
 */
export class RaceDetector {
  constructor(stored: Pick<RaceReference, "_meta" | "overrides" | "raw">) {
    this.stored = stored;
    this.races = sanitizeJsonValues(stored.raw);
  }

  /** The races its page gives, sanitized. */
  private readonly races: RaceReference["raw"];
  /** The reference as stored. */
  private readonly stored: Pick<RaceReference, "_meta" | "overrides" | "raw">;

  /** Each race's detected modifiers. */
  detected(): RaceReference["detected"] {
    return detectModifiersOf(this.races, (entry) => new RaceModifiers(entry));
  }

  /** Each race's description and modifiers: its override's, else what's scraped and detected. */
  mapping(detected: RaceReference["detected"]): RaceReference["mapping"] {
    return buildModifierMapping(this.races, detected, this.stored.overrides ?? {}, () => ({}));
  }

  /** The reference with what's derived from it: its detected section and its mapping. */
  resolve(): RaceReference {
    const { _meta, overrides, raw } = this.stored;
    const detected = this.detected();
    return { _meta, raw, ...sanitizeJsonValues({ overrides, detected, mapping: this.mapping(detected) }) };
  }
}
