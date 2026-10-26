import { ModifiersSection, RequirementsSection } from "@/client/src/pages/rulesets/customization/sections/index.ts";
import type { OwnerSectionProps } from "@/client/src/pages/rulesets/details/owners/ownerTab.ts";

import { useOwnerCustomization } from "./useOwnerCustomization.ts";

/** The owner's own modifiers, which a character with any level of it has, once. */
export function OwnerModifiersSection({ ...props }: OwnerSectionProps) {
  return <ModifiersSection {...useOwnerCustomization(props)} />;
}

/** The owner's own requirements, checked to take any level of it, with that level's own. */
export function OwnerRequirementsSection({ ...props }: OwnerSectionProps) {
  return <RequirementsSection {...useOwnerCustomization(props)} />;
}
