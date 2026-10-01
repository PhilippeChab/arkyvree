import { AutoStories as SpellsIcon } from "@mui/icons-material";
import { useQuery } from "@tanstack/react-query";

import { classSpellsQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";

import { ClassLevelCountsTable } from "./ClassLevelCountsTable.tsx";
import { bySpellLevel, spellLevelLabel } from "./spellLevels.ts";
import type { ClassSectionProps } from "./types.ts";

export function ClassSpellsSection({ rulesetId, classId }: ClassSectionProps) {
  const { data, isLoading } = useQuery(classSpellsQuery(rulesetId, classId));
  return (
    <ClassLevelCountsTable
      title="Spells per Day"
      levels={data}
      isLoading={isLoading}
      keysOf={(level) => Object.keys(level.spellsPerDay)}
      countOf={(level, key) => level.spellsPerDay[Number(key)]}
      compareKeys={bySpellLevel}
      labelOf={spellLevelLabel}
      emptyIcon={SpellsIcon}
      emptyTitle="No spells"
      emptyDescription="This class doesn't have any spells per day data."
    />
  );
}
