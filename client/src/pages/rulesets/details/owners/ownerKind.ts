import { kindIcon, type SvgIconComponent } from "@/client/src/components/icons/index.ts";
import type { CustomizationPage } from "@/client/src/hooks/index.ts";
import type { EntityKindDescription, RulesDescription } from "@/client/src/lib/queries.ts";

/** The picture of a kind of its rules (`type`: the kind an owner links to), by the generic name its rules give it. */
export function kindIconOf(rules: RulesDescription, type: string): SvgIconComponent {
  return kindIcon(rules.kinds.find((kind) => kind.type === type)?.icon ?? "");
}

/** The customization page of the kind an owner owns (3.5's class levels), its levels' kind, of its rules' pages. */
export function levelPageOf(rules: RulesDescription | undefined): CustomizationPage | undefined {
  const ownerType = ownerKindOf(rules)?.type;
  return ownerType === undefined ? undefined : rules?.customizationPages.find((page) => page.owner === ownerType);
}

/** The kind of a progression owner, whose row opens its progression (`opens: "progression"`: 3.5's classes). */
export function ownerKindOf(rules: RulesDescription | undefined): EntityKindDescription | undefined {
  return rules?.kinds.find((kind) => kind.opens === "progression");
}
