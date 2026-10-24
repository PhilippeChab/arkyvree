import { kindIcon, type SvgIconComponent } from "@/client/src/components/icons/index.ts";
import type { CustomizationPage } from "@/client/src/hooks/index.ts";
import type { EntityKindDescription, RulesDescription } from "@/client/src/lib/queries.ts";

/** The kind whose entities a class page shows (`opens: "progression"`: 3.5's classes), of its rules' kinds. */
export function classKindOf(rules: RulesDescription | undefined): EntityKindDescription | undefined {
  return rules?.kinds.find((kind) => kind.opens === "progression");
}

/** The picture of a kind of its rules (`type`: the kind a class's links name), by the generic name its rules give it. */
export function kindIconOf(rules: RulesDescription, type: string): SvgIconComponent {
  return kindIcon(rules.kinds.find((kind) => kind.type === type)?.icon ?? "");
}

/** The customization page of the kind a class owns (3.5's class levels), its levels' kind, of its rules' pages. */
export function levelPageOf(rules: RulesDescription | undefined): CustomizationPage | undefined {
  const classType = classKindOf(rules)?.type;
  return classType === undefined ? undefined : rules?.customizationPages.find((page) => page.owner === classType);
}
