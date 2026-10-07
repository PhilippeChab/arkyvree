/** A feat as a ruleset's entity: what groups it with its family's variants. */

import type { RulesetView } from "@/engine/core/types.ts";
import { FEAT_FAMILY } from "@/shared/dnd3.5/properties/index.ts";

/** The property type that names a feat's family: the feats page and the pickers group a family's variants by it. */
export function getFeatFamilyType(_view: RulesetView) {
  return FEAT_FAMILY;
}
