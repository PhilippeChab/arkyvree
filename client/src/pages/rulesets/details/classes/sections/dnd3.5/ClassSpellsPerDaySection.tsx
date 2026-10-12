import { useQuery } from "@tanstack/react-query";

import { BlankState } from "@/client/src/components/common/index.ts";
import { SpellUsesIcon } from "@/client/src/components/icons/index.ts";
import type { ClassSectionProps } from "@/client/src/pages/rulesets/details/classes/classSectionFactory.ts";
import { classSpellsPerDayQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { ClassLevelCountsTable } from "@/client/src/pages/rulesets/details/classes/sections/ClassLevelCountsTable.tsx";

import { bySpellLevel, spellLevelLabel } from "./spellLevels.ts";

export function ClassSpellsPerDaySection({ rulesetId, classId }: ClassSectionProps) {
  const { data, isLoading, error } = useQuery(classSpellsPerDayQuery(rulesetId, classId));
  return (
    <ClassLevelCountsTable
      what="Spells per Day"
      levels={data}
      isLoading={isLoading}
      error={error}
      keysOf={(level) => Object.keys(level.spellsPerDay)}
      countOf={(level, key) => level.spellsPerDay[Number(key)]}
      compareKeys={bySpellLevel}
      labelOf={spellLevelLabel}
      empty={
        <BlankState
          icon={SpellUsesIcon}
          title="No spells per day"
          description="This class doesn't have any spells per day data."
        />
      }
    />
  );
}
