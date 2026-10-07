import type { DomainReference } from "@/database/packages/dnd35-from-parser/tools/types/domains.ts";

import { buildModifierMapping, detectModifiersOf } from "./modifiers.ts";
import { DomainModifiers } from "./readers/modifiers/DomainModifiers.ts";

export function buildDomainDetected(raw: DomainReference["raw"]): DomainReference["detected"] {
  return detectModifiersOf(raw, (entry) => new DomainModifiers(entry.description));
}

export function buildDomainMapping(
  raw: DomainReference["raw"],
  detected: DomainReference["detected"],
  overrides: NonNullable<DomainReference["overrides"]>,
): DomainReference["mapping"] {
  return buildModifierMapping(
    raw,
    detected,
    overrides,
    (override?: NonNullable<DomainReference["overrides"]>[string]) =>
      override?.featPool ? { featPool: override.featPool } : {},
  );
}
