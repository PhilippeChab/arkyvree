import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";

import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { isStillOpen } from "@/client/src/lib/stillOpen.ts";
import {
  ModifiersSection,
  PropertiesSection,
  RequirementsSection,
} from "@/client/src/pages/rulesets/customization/sections/index.ts";
import {
  classDetailQuery,
  type ClassSection,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";

import type { ClassSectionProps } from "./types.ts";

/** What a customization section of the class takes: the class, and where a copy of it goes. */
function useClassCustomization({ rulesetId, classId, ruleset }: ClassSectionProps, tab: ClassSection) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  return {
    ruleset,
    entityType: "klasses" as const,
    entityId: classId,
    // The class's bonus spells and caster type are properties of it
    queryKeysToInvalidate: [classDetailQuery(rulesetId, classId).queryKey],
    // Customizing an inherited class copies it into this ruleset under a new id: move to the copy, unless the page has
    // left the class since
    onEntityIdChange: (copyId: string, sourceId: string) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(rulesetId, "classes") });
      if (!isStillOpen(`/rulesets/${rulesetId}/classes/${sourceId}`)) return;
      navigate(`/rulesets/${rulesetId}/classes/${copyId}/${tab}`, { replace: true, state: location.state });
    },
  };
}

/** The class's own modifiers, which a character with any level of it has, once. */
export function ClassModifiersSection(props: ClassSectionProps) {
  return <ModifiersSection {...useClassCustomization(props, "modifiers")} />;
}

export function ClassPropertiesSection(props: ClassSectionProps) {
  return <PropertiesSection {...useClassCustomization(props, "properties")} />;
}

/** The class's own requirements, checked to take any level of it, with that level's own. */
export function ClassRequirementsSection(props: ClassSectionProps) {
  return <RequirementsSection {...useClassCustomization(props, "requirements")} />;
}
