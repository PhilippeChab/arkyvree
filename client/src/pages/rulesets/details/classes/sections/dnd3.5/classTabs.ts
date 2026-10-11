import { FeatPoolsIcon, PowersIcon, SpellsIcon, SpellUsesIcon } from "@/client/src/components/icons/index.ts";
import type { ClassTab } from "@/client/src/pages/rulesets/details/classes/classSectionFactory.ts";
import {
  classFeatPoolsQuery,
  classSpellListsQuery,
  classSpellsKnownQuery,
  classSpellsPerDayQuery,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";

import { ClassFeatPoolsSection } from "./ClassFeatPoolsSection.tsx";
import { ClassSpellListSection } from "./ClassSpellListSection.tsx";
import { ClassSpellsKnownSection } from "./ClassSpellsKnownSection.tsx";
import { ClassSpellsPerDaySection } from "./ClassSpellsPerDaySection.tsx";

/**
 * A 3.5 class page's own tabs, what its rules make of a class: its feat pools, its spells known and per day, and the
 * spell list it casts from, each warming its rows as it's pointed at (the spell list's, the lists it picks among).
 */
export const DND35_CLASS_TABS: ClassTab[] = [
  {
    key: "feat-pools",
    label: "Feat Pools",
    icon: FeatPoolsIcon,
    Section: ClassFeatPoolsSection,
    prefetch: (queryClient, rulesetId, classId) => queryClient.prefetchQuery(classFeatPoolsQuery(rulesetId, classId)),
  },
  {
    key: "spells-known",
    label: "Spells Known",
    icon: SpellsIcon,
    Section: ClassSpellsKnownSection,
    prefetch: (queryClient, rulesetId, classId) => queryClient.prefetchQuery(classSpellsKnownQuery(rulesetId, classId)),
  },
  {
    key: "spells-per-day",
    label: "Spells per Day",
    icon: SpellUsesIcon,
    Section: ClassSpellsPerDaySection,
    prefetch: (queryClient, rulesetId, classId) =>
      queryClient.prefetchQuery(classSpellsPerDayQuery(rulesetId, classId)),
  },
  {
    key: "spell-list",
    label: "Spell List",
    icon: PowersIcon,
    Section: ClassSpellListSection,
    prefetch: (queryClient, rulesetId, classId) => queryClient.prefetchQuery(classSpellListsQuery(rulesetId, classId)),
  },
];
