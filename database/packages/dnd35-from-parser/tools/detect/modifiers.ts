/** The modifiers detected in an entry's text (a `ModifierReading`'s), and overridden by hand. */

import type { DetectedModifiers } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";
import type { Modifier } from "@/database/packages/dnd35/content/customization/types.ts";

import type { ModifierReading } from "./readers/modifiers/ModifierReading.ts";

/** Each entry's description and modifiers, its override's or else what's detected, and what `extra` takes from its override and itself. */
export function buildModifierMapping<
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

/** Each entry's detected modifiers, with the invalid paths and the text detection couldn't resolve, when any. */
export function detectModifiersOf<E extends { name: string }>(
  raw: E[],
  read: (entry: E) => Pick<ModifierReading<Modifier>, "errors" | "modifiers" | "unresolved">,
) {
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
