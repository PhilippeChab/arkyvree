import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { SearchBar, DiceSpinner } from "@/client/src/components/common/index.ts";
import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { Bolt as SpellListIcon } from "@mui/icons-material";
import { Box, Button, FormControl, InputLabel, MenuItem, Select, Typography } from "@mui/material";
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

type SpellListResponse = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["spell-list"]["$get"]
>;
type SpellListPaginated = Exclude<SpellListResponse, { error: string }>;
type Spell = SpellListPaginated["items"][number];

const COLUMNS = [
  { key: "name", label: "Name", width: "30%" },
  { key: "description", label: "Description", width: "70%" },
];

interface ClassSpellListSectionProps {
  rulesetId: string;
  classId: string;
  ruleset: {
    id: string;
    name: string;
    userId?: string | null;
    status?: string;
  };
}

export function ClassSpellListSection({ rulesetId, classId, ruleset }: ClassSpellListSectionProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [selectedLevel, setSelectedLevel] = useState<number>(0);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: queryKeys.rulesets.classSpellList(rulesetId, classId, selectedLevel, debouncedSearch),
    queryFn: async ({ pageParam }) => {
      const response = await rpc.api.rulesets[":id"].classes[":classId"]["spell-list"].$get({
        param: { id: rulesetId, classId },
        query: {
          page: pageParam.toString(),
          limit: "20",
          level: selectedLevel.toString(),
          ...(debouncedSearch && { search: debouncedSearch }),
        },
      });
      if (!response.ok) throw new Error("Failed to fetch spells");
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    placeholderData: keepPreviousData,
  });

  const spells = data?.pages.flatMap((page) => page.items) ?? [];

  const handleRowClick = (spell: Spell) => {
    navigate(`/rulesets/${ruleset.id}/powers/${spell.id}/customization`, {
      state: { from: location.pathname + location.search },
    });
  };

  const renderCell = (spell: Spell, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return spell.name;
      case "description":
        return (
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {spell.description || "-"}
          </Typography>
        );
      default:
        return null;
    }
  };

  return (
    <Box>
      <SearchBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search spells..."
        filters={
          <FormControl size="small" sx={{ minWidth: 100 }}>
            <InputLabel>Level</InputLabel>
            <Select
              value={selectedLevel}
              label="Level"
              onChange={(e) => setSelectedLevel(Number(e.target.value))}
            >
              {Array.from({ length: 10 }, (_, i) => (
                <MenuItem key={i} value={i}>{i}</MenuItem>
              ))}
            </Select>
          </FormControl>
        }
      />

      <RulesetSectionTable
        data={spells}
        isLoading={isLoading}
        columns={COLUMNS}
        onRowClick={handleRowClick}
        renderCell={renderCell}
        emptyIcon={<SpellListIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
        emptyTitle="No spells"
        emptyDescription="No spells found for this class at the selected level."
      />

      {hasNextPage && (
        <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
          <Button
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            variant="outlined"
          >
            <DiceSpinner size="small" loading={isFetchingNextPage}>Load More</DiceSpinner>
          </Button>
        </Box>
      )}
    </Box>
  );
}
