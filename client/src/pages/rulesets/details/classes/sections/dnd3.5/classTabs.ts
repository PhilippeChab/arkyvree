import { LevelsIcon, PowersIcon, SpellUsesIcon } from "@/client/src/components/icons/index.ts";
import type { ClassTab } from "@/client/src/pages/rulesets/details/classes/classSectionFactory.ts";
import {
  classFeatPoolsQuery,
  classLevelsQuery,
  classProgressionQuery,
  classSpellListsQuery,
  classSpellsKnownQuery,
  classSpellsPerDayQuery,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";

import { ClassProgressionSection } from "./ClassProgressionSection.tsx";
import { ClassSpellListSection } from "./ClassSpellListSection.tsx";
import { ClassSpellsSection } from "./ClassSpellsSection.tsx";

/** The tabs a 3.5 class page had before its Progression and Spells tabs, by the tab each one's address now opens. */
export const DND35_CLASS_TAB_ALIASES: Record<string, string> = {
  "feat-pools": "progression",
  levels: "progression",
  "spells-known": "spells",
  "spells-per-day": "spells",
};

/**
 * A 3.5 class page's own tabs, its first: its progression (its table, its base attack bonus, saves and skill points,
 * its features and feat pools), its spells per day and known, and the spell list it casts from, each warming its rows
 * as it's pointed at.
 */
export const DND35_CLASS_TABS: ClassTab[] = [
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
    key: "spells",
    label: "Spells",
    icon: SpellUsesIcon,
    Section: ClassSpellsSection,
    prefetch: async (queryClient, rulesetId, classId) => {
      await Promise.all([
        queryClient.prefetchQuery(classSpellsPerDayQuery(rulesetId, classId)),
        queryClient.prefetchQuery(classSpellsKnownQuery(rulesetId, classId)),
      ]);
    },
  },
  {
    key: "spell-list",
    label: "Spell List",
    icon: PowersIcon,
    Section: ClassSpellListSection,
    prefetch: (queryClient, rulesetId, classId) => queryClient.prefetchQuery(classSpellListsQuery(rulesetId, classId)),
  },
];
