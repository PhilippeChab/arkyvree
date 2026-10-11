import { LevelsIcon, SkillsIcon } from "@/client/src/components/icons/index.ts";
import {
  CUSTOMIZATION_TABS,
  type CustomizationSection,
} from "@/client/src/pages/rulesets/customization/sections/index.ts";
import type { ClassTab } from "@/client/src/pages/rulesets/details/classes/classSectionFactory.ts";
import { classLevelsQuery, classSkillsQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";

import {
  ClassModifiersSection,
  ClassPropertiesSection,
  ClassRequirementsSection,
} from "./ClassCustomizationSections.tsx";
import { ClassLevelsSection } from "./ClassLevelsSection.tsx";
import { ClassSkillsSection } from "./ClassSkillsSection.tsx";

/** The class's sections of the tabs that customize it, which read their own rows. */
const CUSTOMIZATION_SECTIONS: Record<CustomizationSection, ClassTab["Section"]> = {
  properties: ClassPropertiesSection,
  modifiers: ClassModifiersSection,
  requirements: ClassRequirementsSection,
};

/** The tabs that customize a class, its page's last: `CUSTOMIZATION_TABS`, each showing the class's own. */
export const CLASS_CUSTOMIZATION_TABS: ClassTab[] = CUSTOMIZATION_TABS.map((tab) => ({
  ...tab,
  Section: CUSTOMIZATION_SECTIONS[tab.key],
}));

/** The tabs every class's page opens on, its levels and its skills, which its base rules' own follow (`getClassSections`). */
export const CLASS_TABS: ClassTab[] = [
  {
    key: "levels",
    label: "Levels",
    icon: LevelsIcon,
    Section: ClassLevelsSection,
    prefetch: (queryClient, rulesetId, classId) => queryClient.prefetchQuery(classLevelsQuery(rulesetId, classId)),
  },
  {
    key: "skills",
    label: "Skills",
    icon: SkillsIcon,
    Section: ClassSkillsSection,
    prefetch: (queryClient, rulesetId, classId) => queryClient.prefetchQuery(classSkillsQuery(rulesetId, classId)),
  },
];
