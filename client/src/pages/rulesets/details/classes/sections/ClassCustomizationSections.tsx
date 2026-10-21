import { ModifiersSection, RequirementsSection } from "@/client/src/pages/rulesets/customization/sections/index.ts";
import type { ClassSectionProps } from "@/client/src/pages/rulesets/details/classes/classTab.ts";

import { useClassCustomization } from "./useClassCustomization.ts";

/** The class's own modifiers, which a character with any level of it has, once. */
export function ClassModifiersSection({ ...props }: ClassSectionProps) {
  return <ModifiersSection {...useClassCustomization(props)} />;
}

/** The class's own requirements, checked to take any level of it, with that level's own. */
export function ClassRequirementsSection({ ...props }: ClassSectionProps) {
  return <RequirementsSection {...useClassCustomization(props)} />;
}
