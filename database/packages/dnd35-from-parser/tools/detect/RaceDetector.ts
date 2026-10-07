import { sanitizeJsonValues } from "@/database/packages/dnd35-from-parser/tools/text/sanitize.ts";
import type { RaceReference } from "@/database/packages/dnd35-from-parser/tools/types/races.ts";

import { BaseDetector } from "./BaseDetector.ts";
import { RaceModifiers } from "./readers/modifiers/RaceModifiers.ts";

/**
 * A race reference's detector: each race's modifiers (`detected`: its ability adjustments, its traits' bonuses), read
 * from its page sanitized, and its description and modifiers, its overrides applied (`mapping`).
 */
export class RaceDetector extends BaseDetector<RaceReference> {
  constructor(stored: Pick<RaceReference, "_meta" | "overrides" | "raw">) {
    super(stored);
    this.races = sanitizeJsonValues(stored.raw);
  }

  /** The races its page gives, sanitized. */
  private readonly races: RaceReference["raw"];

  /** Each race's detected modifiers. */
  protected detected(): RaceReference["detected"] {
    return this.modifiersOf(this.races, (entry) => new RaceModifiers(entry));
  }

  /**
   * Each race as the seeds make it: its description and modifiers, its name, size and speed, its override's or else
   * what's scraped and detected; the properties its override gives, and whether its override skips it.
   */
  protected mapping(detected: RaceReference["detected"]): RaceReference["mapping"] {
    return this.modifierMapping(
      this.races,
      detected,
      this.stored.overrides ?? {},
      (override: NonNullable<RaceReference["overrides"]>[string] | undefined, entry: RaceReference["raw"][number]) => ({
        name: override?.name ?? entry.name,
        size: override?.size ?? entry.size,
        baseSpeed: override?.baseSpeed ?? entry.baseSpeed,
        ...(override?.properties?.length ? { properties: override.properties } : {}),
        ...(override?.skip ? { skip: true } : {}),
      }),
    );
  }
}
