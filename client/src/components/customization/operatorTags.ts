import type { Tag } from "@/client/src/components/common/index.ts";
import { MODIFIER_OPERATOR_LABELS } from "@/client/src/lib/operatorLabels.ts";

/** What a modifier does to its target: adds, multiplies, sets… */
export function modifierOperatorTag(operator: string): Tag {
  return { label: MODIFIER_OPERATOR_LABELS[operator] || operator, color: "secondary" };
}
