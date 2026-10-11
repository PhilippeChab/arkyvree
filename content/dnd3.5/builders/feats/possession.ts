/** A feat's possession, as the 3.5 content names and grants it: the path of having a feat, and its grant. */

import { setFlag } from "@/content/core/builders/customization/modifiers.ts";
import type { Modifier } from "@/content/core/builders/customization/types.ts";
import { stripSeparators } from "@/shared/text.ts";

/** The path of having a feat. */
export function feat(name: string): string {
  return `feats.${stripSeparators(name)}.possessed`;
}

/** The feat `name` possessed: what a race, a class or another feat grants. */
export function grantFeat(name: string): Modifier {
  return setFlag(feat(name));
}
