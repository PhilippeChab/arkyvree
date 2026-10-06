/**
 * A modifier or a property written as code: a domain's, a race's or an item's. A feat's modifier, which has
 * requirements, is written by its file (`CodeFile.featModifier`), which imports their builders.
 */

import { quote } from "@/database/packages/dnd35-from-parser/tools/generator/code/literals.ts";
import type { Modifier, ModifierEffect } from "@/database/packages/dnd35/content/customization/types.ts";

/** A modifier written as code: a domain's, a race's or an item's, which has no requirements (only a feat's has). */
export function stringifyModifier(mod: Modifier): string {
  if ("requirements" in mod) throw new Error(`${mod.target}: only a feat's modifier has requirements`);
  return `{ ${stringifyModifierFields(mod, quote(mod.target)).join(", ")} }`;
}

/** A modifier's fields written as code, its target as `target`. */
export function stringifyModifierFields(mod: ModifierEffect, target: string): string[] {
  return [
    `target: ${target}`,
    `operator: ${quote(mod.operator)}`,
    `value: ${quote(mod.value)}`,
    `valueType: ${quote(mod.valueType)}`,
  ];
}

/** A property written as code. */
export function stringifyProperty({ type, value }: { type: string; value: string }): string {
  return `{ type: ${quote(type)}, value: ${quote(value)} }`;
}
