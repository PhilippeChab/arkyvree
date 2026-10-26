import { LevelsIcon, UsesIcon } from "@/client/src/components/icons/index.ts";
import type { EntityLinksDescription, ProgressionCounts, RulesDescription } from "@/client/src/lib/queries.ts";
import { entityTypeLabel } from "@/client/src/lib/rulesetLabels.ts";
import {
  type CustomizationSection,
  describeCustomizationTabs,
} from "@/client/src/pages/rulesets/customization/sections/index.ts";
import { kindIconOf, ownerKindOf } from "@/client/src/pages/rulesets/details/owners/ownerKind.ts";
import {
  levelsQuery,
  ownerLinksQuery,
  ownerListsQuery,
  ownerProgressionQuery,
  ownerTableQuery,
} from "@/client/src/pages/rulesets/details/owners/ownerSectionQueries.ts";
import type { OwnerTab } from "@/client/src/pages/rulesets/details/owners/ownerTab.ts";

import { OwnerModifiersSection, OwnerRequirementsSection } from "./OwnerCustomizationSections.tsx";
import { OwnerLinksSection } from "./OwnerLinksSection.tsx";
import { OwnerListSection } from "./progression/OwnerListSection.tsx";
import { OwnerProgressionSection } from "./progression/OwnerProgressionSection.tsx";
import { OwnerTablesSection } from "./progression/OwnerTablesSection.tsx";

/** The owner's sections of the tabs that customize it, which read their own rows. */
const CUSTOMIZATION_SECTIONS: Record<CustomizationSection, OwnerTab["Section"]> = {
  modifiers: OwnerModifiersSection,
  requirements: OwnerRequirementsSection,
};

/**
 * The tabs of an owner whose levels count entities on its tables (`counts`, its rules' progression's: 3.5's spells),
 * in their kind's words (`rules`): its tables', and its list's, of the entities it counts.
 */
export function describeCountsTabs(counts: ProgressionCounts, rules: RulesDescription): OwnerTab[] {
  const ownerType = ownerKindOf(rules)?.type ?? "";
  return [
    {
      key: counts.tab,
      label: entityTypeLabel(counts.type, rules.words, true),
      icon: UsesIcon,
      Section: OwnerTablesSection,
      prefetch: async (queryClient, rulesetId, ownerId) => {
        await Promise.all([
          ...rules.progression.tables.map(({ table }) =>
            queryClient.prefetchQuery(ownerTableQuery(rulesetId, ownerType, ownerId, table)),
          ),
          // Its list, which its editing waits for
          queryClient.prefetchQuery(ownerProgressionQuery(rulesetId, ownerType, ownerId)),
        ]);
      },
    },
    {
      key: counts.listTab,
      label: `${entityTypeLabel(counts.type, rules.words)} List`,
      icon: kindIconOf(rules, counts.type),
      Section: OwnerListSection,
      prefetch: (queryClient, rulesetId, ownerId) =>
        queryClient.prefetchQuery(ownerListsQuery(rulesetId, ownerType, ownerId, counts.lists)),
    },
  ];
}

/**
 * The tab of the entities an owner links to (`links`, its rules' owner kind's: 3.5's skills), at their kind's URL
 * segment, named and pictured as their kind (`rules`).
 */
export function describeLinksTab(links: EntityLinksDescription, rules: RulesDescription): OwnerTab {
  const ownerType = ownerKindOf(rules)?.type ?? "";
  return {
    key: links.type,
    label: entityTypeLabel(links.type, rules.words, true),
    icon: kindIconOf(rules, links.type),
    Section: OwnerLinksSection,
    prefetch: (queryClient, rulesetId, ownerId) =>
      queryClient.prefetchQuery(ownerLinksQuery(rulesetId, ownerType, ownerId, links.type)),
  };
}

/**
 * The tabs that customize an owner, its page's last, their help its rules' (`rules`): `describeCustomizationTabs`'s,
 * each showing the owner's own.
 */
export function describeOwnerCustomizationTabs(rules: RulesDescription | undefined): OwnerTab[] {
  return describeCustomizationTabs(rules).map((tab) => ({ ...tab, Section: CUSTOMIZATION_SECTIONS[tab.key] }));
}

/**
 * The tab every owner's page opens on, warming its rows as it's pointed at (`rules`, its rules'): its progression (its
 * table, its tracks, its features and pools, their totals' table where its levels grant past their columns).
 */
export function describeProgressionTab(rules: RulesDescription | undefined): OwnerTab {
  const totals = rules?.progression.grants?.table;
  const ownerType = ownerKindOf(rules)?.type ?? "";
  return {
    key: "progression",
    label: "Progression",
    icon: LevelsIcon,
    Section: OwnerProgressionSection,
    prefetch: async (queryClient, rulesetId, ownerId) => {
      await Promise.all([
        queryClient.prefetchQuery(levelsQuery(rulesetId, ownerType, ownerId)),
        queryClient.prefetchQuery(ownerProgressionQuery(rulesetId, ownerType, ownerId)),
        ...(totals ? [queryClient.prefetchQuery(ownerTableQuery(rulesetId, ownerType, ownerId, totals))] : []),
      ]);
    },
  };
}
