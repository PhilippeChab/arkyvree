import { useQuery } from "@tanstack/react-query";

import { FeatPoolsIcon } from "@/client/src/components/icons/index.ts";
import { classFeatPoolsQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";

import { ClassLevelCountsTable } from "./ClassLevelCountsTable.tsx";
import type { ClassSectionProps } from "./types.ts";

export function ClassFeatPoolsSection({ rulesetId, classId }: ClassSectionProps) {
  const { data, isLoading } = useQuery(classFeatPoolsQuery(rulesetId, classId));
  return (
    <ClassLevelCountsTable
      levels={data}
      isLoading={isLoading}
      keysOf={(level) => Object.keys(level.featPools)}
      countOf={(level, key) => level.featPools[key]}
      emptyIcon={FeatPoolsIcon}
      emptyTitle="No feat pools"
      emptyDescription="This class doesn't have any feat pool data."
    />
  );
}
