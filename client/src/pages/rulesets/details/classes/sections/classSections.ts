import { LevelsIcon, UsesIcon } from "@/client/src/components/icons/index.ts";
import type { EntityLinksDescription, ProgressionCounts, RulesDescription } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import {
  CUSTOMIZATION_TABS,
  type CustomizationSection,
} from "@/client/src/pages/rulesets/customization/sections/index.ts";
import { kindIconOf } from "@/client/src/pages/rulesets/details/classes/classKind.ts";
import {
  classLevelsQuery,
  classLinksQuery,
  classListsQuery,
  classProgressionQuery,
  classTableQuery,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import type { ClassTab } from "@/client/src/pages/rulesets/details/classes/classTab.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import { ClassModifiersSection, ClassRequirementsSection } from "./ClassCustomizationSections.tsx";
import { ClassLinksSection } from "./ClassLinksSection.tsx";
import { ClassListSection } from "./progression/ClassListSection.tsx";
import { ClassProgressionSection } from "./progression/ClassProgressionSection.tsx";
import { ClassTablesSection } from "./progression/ClassTablesSection.tsx";

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
 * The tabs of a class whose levels count entities on its tables (`counts`, its rules' progression's: 3.5's spells),
 * in their kind's words (`rules`): its tables', and its list's, of the entities it counts.
 */
export function describeCountsTabs(counts: ProgressionCounts, rules: RulesDescription): ClassTab[] {
  return [
    {
      key: counts.tab,
      label: entityTypeLabel(counts.type, rules.words, true),
      icon: UsesIcon,
      Section: ClassTablesSection,
      prefetch: async (queryClient, rulesetId, classId) => {
        await Promise.all([
          ...rules.progression.tables.map(({ table }) =>
            queryClient.prefetchQuery(classTableQuery(rulesetId, classId, table)),
          ),
          // Its list, which its editing waits for
          queryClient.prefetchQuery(classProgressionQuery(rulesetId, classId)),
        ]);
      },
    },
    {
      key: counts.listTab,
      label: `${entityTypeLabel(counts.type, rules.words)} List`,
      icon: kindIconOf(rules, counts.type),
      Section: ClassListSection,
      prefetch: (queryClient, rulesetId, classId) =>
        queryClient.prefetchQuery(classListsQuery(rulesetId, classId, counts.lists)),
    },
  ];
}

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
 * The tab every class's page opens on, warming its rows as it's pointed at (`rules`, its rules'): its progression (its
 * table, its tracks, its features and pools, their totals' table where its levels grant past their columns).
 */
export function describeProgressionTab(rules: RulesDescription | undefined): ClassTab {
  const totals = rules?.progression.grants?.table;
  return {
    key: "progression",
    label: "Progression",
    icon: LevelsIcon,
    Section: ClassProgressionSection,
    prefetch: async (queryClient, rulesetId, classId) => {
      await Promise.all([
        queryClient.prefetchQuery(classLevelsQuery(rulesetId, classId)),
        queryClient.prefetchQuery(classProgressionQuery(rulesetId, classId)),
        ...(totals ? [queryClient.prefetchQuery(classTableQuery(rulesetId, classId, totals))] : []),
      ]);
    },
  };
}
