import { LevelsIcon, PowersIcon, SpellUsesIcon } from "@/client/src/components/icons/index.ts";
import type { EntityLinksDescription, RulesDescription, RulesWords } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import {
  CUSTOMIZATION_TABS,
  type CustomizationSection,
} from "@/client/src/pages/rulesets/customization/sections/index.ts";
import { kindIconOf } from "@/client/src/pages/rulesets/details/classes/classKind.ts";
import {
  classFeatPoolsQuery,
  classLevelsQuery,
  classLinksQuery,
  classProgressionQuery,
  classSpellListsQuery,
  classSpellsKnownQuery,
  classSpellsPerDayQuery,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import type { ClassTab } from "@/client/src/pages/rulesets/details/classes/classTab.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import { ClassModifiersSection, ClassRequirementsSection } from "./ClassCustomizationSections.tsx";
import { ClassLinksSection } from "./ClassLinksSection.tsx";
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
 * The tab every class's page opens on, warming its rows as it's pointed at: its progression (its table, its tracks, its
 * features and feat pools).
 */
export const PROGRESSION_TAB: ClassTab = {
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
};

/**
 * The tab of the entities a class links to (`links`, its rules' class kind's: 3.5's skills), at their kind's URL
 * segment, named and pictured as their kind (`rules`).
 */
export function describeLinksTab(links: EntityLinksDescription, rules: RulesDescription): ClassTab {
  return {
    key: getUrlSegment(links.type),
    label: entityTypeLabel(links.type, rules.words, true),
    icon: kindIconOf(rules, links.type),
    Section: ClassLinksSection,
    prefetch: (queryClient, rulesetId, classId) =>
      queryClient.prefetchQuery(classLinksQuery(rulesetId, classId, links.type)),
  };
}

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
