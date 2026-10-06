/** Builders the content's modifiers are written with, as its requirements are with `requirements.ts`'s. */

import type { Modifier } from "@/database/packages/dnd35/content/customization/types.ts";

/** `value` added to `target`. */
export function bonus(target: string, value: number): Modifier {
  return {
    target,
    operator: "add",
    value: String(value),
    valueType: "number",
  };
}

/** The feat `slug` possessed: what a race or a class grants. */
export function grantFeat(slug: string) {
  return {
    target: `feats.${slug}.possessed`,
    operator: "set",
    value: "true",
    valueType: "boolean",
  };
}
