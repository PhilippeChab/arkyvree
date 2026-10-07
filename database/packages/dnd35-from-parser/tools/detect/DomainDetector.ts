import { sanitizeJsonValues } from "@/database/packages/dnd35-from-parser/tools/text/sanitize.ts";
import type { DomainReference } from "@/database/packages/dnd35-from-parser/tools/types/domains.ts";

import { buildModifierMapping, detectModifiersOf } from "./modifiers.ts";
import { DomainModifiers } from "./readers/modifiers/DomainModifiers.ts";

/**
 * A domain reference's detector: each domain's modifiers (`detected`: the class skills its granted power adds), and
 * its description, modifiers and feat pool, its overrides applied (`mapping`).
 */
export class DomainDetector {
  constructor(stored: Pick<DomainReference, "_meta" | "overrides" | "raw">) {
    this.stored = stored;
  }

  /** The reference as stored. */
  private readonly stored: Pick<DomainReference, "_meta" | "overrides" | "raw">;

  /** Each domain's detected modifiers. */
  detected(): DomainReference["detected"] {
    return detectModifiersOf(this.stored.raw, (entry) => new DomainModifiers(entry.description));
  }

  /**
   * Each domain as the seeds make it: its description, modifiers, name and spells, its override's or else what's
   * scraped and detected, and its override's feat pool.
   */
  mapping(detected: DomainReference["detected"]): DomainReference["mapping"] {
    return buildModifierMapping(
      this.stored.raw,
      detected,
      this.stored.overrides ?? {},
      (
        override: NonNullable<DomainReference["overrides"]>[string] | undefined,
        entry: DomainReference["raw"][number],
      ) => ({
        name: override?.name ?? entry.name,
        spells: override?.spells ?? entry.spells,
        ...(override?.featPool ? { featPool: override.featPool } : {}),
      }),
    );
  }

  /** The reference with what's derived from it: its detected section and its mapping. */
  resolve(): DomainReference {
    const { _meta, overrides, raw } = this.stored;
    const detected = this.detected();
    return { _meta, raw, ...sanitizeJsonValues({ overrides, detected, mapping: this.mapping(detected) }) };
  }
}
