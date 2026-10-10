import { sanitizeJsonValues } from "@/codegen/dnd3.5/tools/text/sanitize.ts";
import type { DetectedModifiers } from "@/codegen/dnd3.5/tools/types/reference.ts";
import type { Modifier } from "@/content/core/builders/customization/types.ts";

import type { ModifierReading } from "./readers/modifiers/ModifierReading.ts";

/** A reference as a detector resolves it: what it stores, and what's derived from it. */
type Reference = { _meta: unknown; detected: unknown; mapping: unknown; overrides?: unknown; raw: unknown };

/** A reference resolved: what it stores, with what's derived from it. */
export type Resolved<R extends Reference> = Pick<R, "_meta" | "detected" | "mapping" | "overrides" | "raw">;

/**
 * A reference's detector's core: the reference as stored (`stored`), and the reference resolved (`resolve`): its
 * detected section (`detected`, parsed from its raw) and its mapping (`mapping`, each entity as the seeds make it,
 * its overrides applied), sanitized with its overrides. A kind that resolves another way says how: a spell's,
 * unsanitized; a magic item's, its mapping made of its sanitized sections. (A wizard school's page gives nothing to
 * detect: its detector maps it alone.)
 */
export abstract class BaseDetector<R extends Reference> {
  constructor(stored: Pick<R, "_meta" | "overrides" | "raw">) {
    this.stored = stored;
  }

  /** The reference as stored: what the scraper read, and the corrections made by hand. */
  readonly stored: Pick<R, "_meta" | "overrides" | "raw">;

  /** What's detected in the reference's raw. */
  protected abstract detected(): R["detected"];

  /** Each entity as the seeds make it: what's detected and scraped, its overrides applied. */
  protected abstract mapping(detected: R["detected"]): R["mapping"];

  /**
   * Each entry's description and modifiers, its override's or else what's detected (none when it has none), and what
   * `extra` takes from its override and itself.
   */
  protected modifierMapping<
    E extends { description: string; name: string },
    O extends { description?: string; modifiers?: Modifier[] },
    X extends object,
  >(
    raw: E[],
    detected: Record<string, { modifiers: Modifier[] } | undefined>,
    overrides: Record<string, O | undefined>,
    extra: (override: O | undefined, entry: E) => X,
  ) {
    const mapping: Record<string, { description: string; modifiers?: Modifier[] } & X> = {};
    for (const entry of raw) {
      const override = overrides[entry.name];
      const modifiers = override?.modifiers ?? detected[entry.name]?.modifiers ?? [];
      mapping[entry.name] = {
        description: override?.description ?? entry.description,
        ...(modifiers.length > 0 ? { modifiers } : {}),
        ...extra(override, entry),
      };
    }
    return mapping;
  }

  /** Each entry's detected modifiers (`read`), with the invalid paths and the text it couldn't read, when any. */
  protected modifiersOf<E extends { name: string }>(
    raw: E[],
    read: (entry: E) => Pick<ModifierReading<Modifier>, "errors" | "modifiers" | "unresolved">,
  ): Record<string, DetectedModifiers> {
    const detected: Record<string, DetectedModifiers> = {};
    for (const entry of raw) {
      const { modifiers, errors, unresolved: unresolvedModifiers } = read(entry);
      detected[entry.name] = {
        modifiers,
        ...(errors.length > 0 ? { errors } : {}),
        ...(unresolvedModifiers.length > 0 ? { unresolvedModifiers } : {}),
      };
    }
    return detected;
  }

  /** The reference with what's derived from it: its detected section and its mapping, sanitized with its overrides. */
  resolve(): Resolved<R> {
    const { _meta, overrides, raw } = this.stored;
    const detected = this.detected();
    return { _meta, raw, ...sanitizeJsonValues({ overrides, detected, mapping: this.mapping(detected) }) };
  }
}
