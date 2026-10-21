import { LevelsIcon, PowersIcon, SkillsIcon, SpellUsesIcon } from "@/client/src/components/icons/index.ts";
import type { RulesWords } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import {
  CUSTOMIZATION_TABS,
  type CustomizationSection,
} from "@/client/src/pages/rulesets/customization/sections/index.ts";
import {
  classFeatPoolsQuery,
  classLevelsQuery,
  classProgressionQuery,
  classSkillsQuery,
  classSpellListsQuery,
  classSpellsKnownQuery,
  classSpellsPerDayQuery,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import type { ClassTab } from "@/client/src/pages/rulesets/details/classes/classTab.ts";

import { ClassModifiersSection, ClassRequirementsSection } from "./ClassCustomizationSections.tsx";
import { ClassSkillsSection } from "./ClassSkillsSection.tsx";
import { ClassProgressionSection } from "./progression/ClassProgressionSection.tsx";
import { ClassSpellListSection } from "./progression/ClassSpellListSection.tsx";
import { ClassSpellsSection } from "./progression/ClassSpellsSection.tsx";

/** The class's sections of the tabs that customize it, which read their own rows. */
const CUSTOMIZATION_SECTIONS: Record<CustomizationSection, ClassTab["Section"]> = {
  modifiers: ClassModifiersSection,
  requirements: ClassRequirementsSection,
};

/** The tabs that customize a class, its page's last: `CUSTOMIZATION_TABS`, each showing the class's own. */
export const CLASS_CUSTOMIZATION_TABS: ClassTab[] = CUSTOMIZATION_TABS.map((tab) => ({
  ...tab,
  Section: CUSTOMIZATION_SECTIONS[tab.key],
}));

/**
 * The tabs every class's page opens on, each warming its rows as it's pointed at: its progression (its table, its
 * tracks, its features and feat pools), the one it opens on, and its skills.
 */
export const CLASS_TABS: ClassTab[] = [
  {
    key: "progression",
    label: "Progression",
    icon: LevelsIcon,
    Section: ClassProgressionSection,
    prefetch: async (queryClient, rulesetId, classId) => {
      await Promise.all([
        queryClient.prefetchQuery(classLevelsQuery(rulesetId, classId)),
        queryClient.prefetchQuery(classProgressionQuery(rulesetId, classId)),
        queryClient.prefetchQuery(classFeatPoolsQuery(rulesetId, classId)),
      ]);
    },
  },
  {
    key: "skills",
    label: "Skills",
    icon: SkillsIcon,
    Section: ClassSkillsSection,
    prefetch: (queryClient, rulesetId, classId) => queryClient.prefetchQuery(classSkillsQuery(rulesetId, classId)),
  },
];

/**
 * The tabs of a class whose rules have spell tables, in their words (`words`: 3.5's "Spells"): its spell tables, and
 * the spell list it casts from.
 */
export function describeSpellTabs(words: RulesWords | undefined): ClassTab[] {
  return [
    {
      key: "spells",
      label: entityTypeLabel("powers", words, true),
      icon: SpellUsesIcon,
      Section: ClassSpellsSection,
      prefetch: async (queryClient, rulesetId, classId) => {
        await Promise.all([
          queryClient.prefetchQuery(classSpellsPerDayQuery(rulesetId, classId)),
          queryClient.prefetchQuery(classSpellsKnownQuery(rulesetId, classId)),
          // Its spell list, which its editing waits for
          queryClient.prefetchQuery(classProgressionQuery(rulesetId, classId)),
        ]);
      },
    },
    {
      key: "spell-list",
      label: `${entityTypeLabel("powers", words)} List`,
      icon: PowersIcon,
      Section: ClassSpellListSection,
      prefetch: (queryClient, rulesetId, classId) =>
        queryClient.prefetchQuery(classSpellListsQuery(rulesetId, classId)),
    },
  ];
}
