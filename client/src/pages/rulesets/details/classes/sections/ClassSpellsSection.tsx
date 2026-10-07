import { useQuery } from "@tanstack/react-query";

import { SpellUsesIcon } from "@/client/src/components/icons/index.ts";
import { classSpellsQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";

import { ClassLevelCountsTable } from "./ClassLevelCountsTable.tsx";
import { bySpellLevel, spellLevelLabel } from "./spellLevels.ts";
import type { ClassSectionProps } from "./types.ts";

export function ClassSpellsSection({ rulesetId, classId }: ClassSectionProps) {
  const { data, isLoading, error } = useQuery(classSpellsQuery(rulesetId, classId));
  return (
    <ClassLevelCountsTable
      title="Spells per Day"
      levels={data}
      isLoading={isLoading}
      error={error}
      keysOf={(level) => Object.keys(level.spellsPerDay)}
      countOf={(level, key) => level.spellsPerDay[Number(key)]}
      compareKeys={bySpellLevel}
      labelOf={spellLevelLabel}
      emptyIcon={SpellUsesIcon}
      emptyTitle="No spells"
      emptyDescription="This class doesn't have any spells per day data."
    />
  );
}
