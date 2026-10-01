import { AutoStories as SpellsIcon } from "@mui/icons-material";
import { useQuery } from "@tanstack/react-query";

import { classSpellsKnownQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";

import { ClassLevelCountsTable } from "./ClassLevelCountsTable.tsx";
import { bySpellLevel, spellLevelLabel } from "./spellLevels.ts";
import type { ClassSectionProps } from "./types.ts";

export function ClassSpellsKnownSection({ rulesetId, classId }: ClassSectionProps) {
  const { data, isLoading } = useQuery(classSpellsKnownQuery(rulesetId, classId));
  return (
    <ClassLevelCountsTable
      title="Spells Known"
      levels={data}
      isLoading={isLoading}
      keysOf={(level) => Object.keys(level.spellsKnown)}
      countOf={(level, key) => level.spellsKnown[Number(key)]}
      compareKeys={bySpellLevel}
      labelOf={spellLevelLabel}
      emptyIcon={SpellsIcon}
      emptyTitle="No spells known"
      emptyDescription="This class doesn't have any spells known data."
    />
  );
}
