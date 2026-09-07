import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { EmojiEvents as FeatPoolsIcon } from "@mui/icons-material";
import { Box, Chip, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useMemo } from "react";

type FeatPoolsResponse = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["feat-pools"]["$get"]
>;
type FeatPoolsArray = Exclude<FeatPoolsResponse, { error: string }>;
type FeatPoolLevel = FeatPoolsArray[number];

interface ClassFeatPoolsSectionProps {
  rulesetId: string;
  classId: string;
  ruleset: {
    id: string;
    name: string;
    userId?: string | null;
    status?: string;
  };
}

export function ClassFeatPoolsSection({ rulesetId, classId }: ClassFeatPoolsSectionProps) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.rulesets.classFeatPools(rulesetId, classId),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].classes[":classId"]["feat-pools"].$get({
        param: { id: rulesetId, classId },
      });
      if (!response.ok) throw new Error("Failed to fetch feat pools");
      return response.json();
    },
  });

  // Derive aptitude name columns from the union of all feat pool keys in the data
  const poolNames = useMemo(() => {
    if (!data) return [];
    const allNames = new Set<string>();
    for (const level of data) {
      for (const key of Object.keys(level.featPools)) {
        allNames.add(key);
      }
    }
    return [...allNames].sort();
  }, [data]);

  const hasPools = poolNames.length > 0;

  const columns = useMemo(() => {
    if (!hasPools) return [{ key: "level", label: "Level", width: "100%" }];
    const poolColumns = poolNames.map((name) => ({
      key: `pool_${name}`,
      label: name,
      width: `${Math.floor(80 / poolNames.length)}%`,
    }));
    return [
      { key: "level", label: "Level", width: "12%" },
      ...poolColumns,
    ];
  }, [poolNames, hasPools]);

  const sortedData = useMemo(
    () => data?.sort((a, b) => a.level - b.level),
    [data],
  );

  const renderCell = (level: FeatPoolLevel, columnKey: string) => {
    if (columnKey === "level") {
      return (
        <Chip
          label={level.level}
          size="small"
          color="primary"
        />
      );
    }

    if (columnKey.startsWith("pool_")) {
      const poolName = columnKey.replace("pool_", "");
      const value = level.featPools[poolName as keyof typeof level.featPools] as number | undefined;
      return (
        <Typography variant="body2" color={value != null ? "text.primary" : "text.secondary"}>
          {value != null ? value : "\u2014"}
        </Typography>
      );
    }

    return null;
  };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6">Feat Pools</Typography>
      </Box>

      <RulesetSectionTable
        data={hasPools ? sortedData : undefined}
        isLoading={isLoading}
        columns={columns}
        renderCell={renderCell}
        emptyIcon={<FeatPoolsIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
        emptyTitle="No feat pools"
        emptyDescription="This class doesn't have any feat pool data."
      />
    </Box>
  );
}
