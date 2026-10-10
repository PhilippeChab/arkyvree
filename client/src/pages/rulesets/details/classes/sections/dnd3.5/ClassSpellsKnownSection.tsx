import { useQuery } from "@tanstack/react-query";

import { SpellsIcon } from "@/client/src/components/icons/index.ts";
import type { ClassSectionProps } from "@/client/src/pages/rulesets/details/classes/classSectionFactory.ts";
import { classSpellsKnownQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { ClassLevelCountsTable } from "@/client/src/pages/rulesets/details/classes/sections/ClassLevelCountsTable.tsx";

import { bySpellLevel, spellLevelLabel } from "./spellLevels.ts";

export function ClassSpellsKnownSection({ rulesetId, classId }: ClassSectionProps) {
  const { data, isLoading, error } = useQuery(classSpellsKnownQuery(rulesetId, classId));
  return (
    <ClassLevelCountsTable
      what="Spells Known"
      levels={data}
      isLoading={isLoading}
      error={error}
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
