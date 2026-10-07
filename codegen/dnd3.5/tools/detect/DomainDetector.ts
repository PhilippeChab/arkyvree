import type { DomainReference } from "@/codegen/dnd3.5/tools/types/domains.ts";

import { BaseDetector } from "./BaseDetector.ts";
import { DomainModifiers } from "./readers/modifiers/DomainModifiers.ts";

/**
 * A domain reference's detector: each domain's modifiers (`detected`: the class skills its granted power adds), and
 * its description, modifiers and feat pool, its overrides applied (`mapping`).
 */
export class DomainDetector extends BaseDetector<DomainReference> {
  /** Each domain's detected modifiers. */
  protected detected(): DomainReference["detected"] {
    return this.modifiersOf(this.stored.raw, (entry) => new DomainModifiers(entry.description));
  }

  /**
   * Each domain as the seeds make it: its description, modifiers, name and spells, its override's or else what's
   * scraped and detected, and its override's feat pool.
   */
  protected mapping(detected: DomainReference["detected"]): DomainReference["mapping"] {
    return this.modifierMapping(
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
}
