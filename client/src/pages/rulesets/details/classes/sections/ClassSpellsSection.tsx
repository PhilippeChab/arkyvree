import { useQuery } from "@tanstack/react-query";

import { SpellProgressionIcon } from "@/client/src/components/icons/index.ts";
import { classSpellsQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";

import { ClassLevelCountsTable } from "./ClassLevelCountsTable.tsx";
import { bySpellLevel, spellLevelLabel } from "./spellLevels.ts";
import type { ClassSectionProps } from "./types.ts";

export function ClassSpellsSection({ rulesetId, classId }: ClassSectionProps) {
  const { data, isLoading } = useQuery(classSpellsQuery(rulesetId, classId));
  return (
    <ClassLevelCountsTable
      levels={data}
      isLoading={isLoading}
      keysOf={(level) => Object.keys(level.spellsPerDay)}
      countOf={(level, key) => level.spellsPerDay[Number(key)]}
      compareKeys={bySpellLevel}
      labelOf={spellLevelLabel}
      emptyIcon={SpellProgressionIcon}
      emptyTitle="No spells"
      emptyDescription="This class doesn't have any spells per day data."
    />
  );
}
