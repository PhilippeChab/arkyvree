import { Box, Stack, Typography } from "@mui/material";
import { type ElementType, useMemo } from "react";

import { TagChip } from "@/client/src/components/common/index.ts";
import { levelTag, RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";

interface ClassLevelCountsTableProps<L extends { id: string; level: number }> {
  title: string;
  levels: L[] | undefined;
  isLoading: boolean;
  /** The column keys a class level has counts for: its feat pools, or its spell levels. */
  keysOf: (level: L) => string[];
  countOf: (level: L, key: string) => number | "All" | undefined;
  compareKeys?: (a: string, b: string) => number;
  labelOf?: (key: string) => string;
  emptyIcon: ElementType;
  emptyTitle: string;
  emptyDescription: string;
}

/** A class's counts per level, one column per key any of its levels has. */
export function ClassLevelCountsTable<L extends { id: string; level: number }>({
  title,
  levels,
  isLoading,
  keysOf,
  countOf,
  compareKeys,
  labelOf = (key) => key,
  emptyIcon,
  emptyTitle,
  emptyDescription,
}: ClassLevelCountsTableProps<L>) {
  const keys = [...new Set((levels ?? []).flatMap(keysOf))].sort(compareKeys);

  const columns =
    keys.length === 0
      ? [{ key: "level", label: "Level", width: "100%" }]
      : [
          { key: "level", label: "Level", width: "12%" },
          ...keys.map((key) => ({
            key: `count_${key}`,
            label: labelOf(key),
            width: `${Math.floor(80 / keys.length)}%`,
          })),
        ];

  // A copy: sorting the query's own array would reorder its cache.
  const sortedLevels = useMemo(() => levels && [...levels].sort((a, b) => a.level - b.level), [levels]);

  const renderCell = (level: L, columnKey: string) => {
    if (columnKey === "level") {
      return <TagChip tag={levelTag(level.level)} />;
    }
    const value = countOf(level, columnKey.replace("count_", ""));
    return (
      <Typography variant="body2" sx={{ color: value != null ? "text.primary" : "text.secondary" }}>
        {value ?? "—"}
      </Typography>
    );
  };

  return (
    <Box>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography component="h2" variant="h6">
          {title}
        </Typography>
      </Stack>

      <RulesetSectionTable
        data={keys.length > 0 ? sortedLevels : undefined}
        isLoading={isLoading}
        columns={columns}
        renderCell={renderCell}
        emptyIcon={emptyIcon}
        emptyTitle={emptyTitle}
        emptyDescription={emptyDescription}
      />
    </Box>
  );
}
