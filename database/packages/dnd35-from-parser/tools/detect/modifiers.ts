/** The modifiers detected in an entry's text, checked against the target paths and overridden by hand. */

import type { DetectedModifiers } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";
import type { Modifier, ModifierEffect, ModifierSeed } from "@/database/packages/dnd35/content/customization/types.ts";

/**
 * What detecting an entry's modifiers finds: its modifiers (a feat's `ModifierSeed`, a domain's or a race's
 * `Modifier`), the invalid paths and the text it couldn't parse.
 */
export type ModifierDetection<M extends ModifierEffect = ModifierSeed> = {
  modifiers: M[];
  errors: string[];
  unresolvedModifiers: string[];
};

/** Each entry's description and modifiers, its override's or else what's detected, and what `extra` takes from its override. */
export function buildModifierMapping<
  E extends { name: string; description: string },
  O extends { description?: string; modifiers?: Modifier[] },
  X extends object,
>(
  raw: E[],
  detected: Record<string, { modifiers: Modifier[] } | undefined>,
  overrides: Record<string, O | undefined>,
  extra: (override: O | undefined) => X,
) {
  const mapping: Record<string, { description: string; modifiers?: Modifier[] } & X> = {};
  for (const entry of raw) {
    const override = overrides[entry.name];
    const modifiers = override?.modifiers ?? detected[entry.name]?.modifiers ?? [];
    mapping[entry.name] = {
      description: override?.description ?? entry.description,
      ...(modifiers.length > 0 ? { modifiers } : {}),
      ...extra(override),
    };
  }
  return mapping;
}

/** Each entry's detected modifiers, with the invalid paths and the text detection couldn't resolve, when any. */
export function detectModifiersOf<E extends { name: string }>(
  raw: E[],
  detect: (entry: E) => ModifierDetection<Modifier>,
) {
  const detected: Record<string, DetectedModifiers> = {};
  for (const entry of raw) {
    const { modifiers, errors, unresolvedModifiers } = detect(entry);
    detected[entry.name] = {
      modifiers,
      ...(errors.length > 0 ? { errors } : {}),
      ...(unresolvedModifiers.length > 0 ? { unresolvedModifiers } : {}),
    };
  }
  return detected;
}

export function validateModifiers<M extends ModifierEffect>(
  modifiers: M[],
  isValid: (target: string) => boolean,
): { validated: M[]; errors: string[] } {
  const validated: M[] = [];
  const errors: string[] = [];
  for (const m of modifiers) {
    if (isValid(m.target)) {
      validated.push(m);
    } else {
      errors.push(`Invalid modifier path "${m.target}": ${m.operator} ${m.value}`);
    }
  }
  return { validated, errors };
}
