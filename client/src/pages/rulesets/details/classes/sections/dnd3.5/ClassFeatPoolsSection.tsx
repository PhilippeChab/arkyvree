import { useQuery } from "@tanstack/react-query";

import { BlankState } from "@/client/src/components/common/index.ts";
import { FeatPoolsIcon } from "@/client/src/components/icons/index.ts";
import type { ClassSectionProps } from "@/client/src/pages/rulesets/details/classes/classSectionFactory.ts";
import { classFeatPoolsQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { ClassLevelCountsTable } from "@/client/src/pages/rulesets/details/classes/sections/ClassLevelCountsTable.tsx";

export function ClassFeatPoolsSection({ rulesetId, classId }: ClassSectionProps) {
  const { data, isLoading, error } = useQuery(classFeatPoolsQuery(rulesetId, classId));
  return (
    <ClassLevelCountsTable
      what="Feat Pools"
      levels={data}
      isLoading={isLoading}
      error={error}
      keysOf={(level) => Object.keys(level.featPools)}
      countOf={(level, key) => level.featPools[key]}
      empty={
        <BlankState
          icon={FeatPoolsIcon}
          title="No feat pools"
          description="This class doesn't have any feat pool data."
        />
      }
    />
  );
}
