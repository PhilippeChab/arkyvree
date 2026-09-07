import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { AutoStories as SpellsIcon } from "@mui/icons-material";
import { Box, Chip, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useMemo } from "react";

type SpellsResponse = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["spells"]["$get"]
>;
type SpellsArray = Exclude<SpellsResponse, { error: string }>;
type SpellLevel = SpellsArray[number];

interface ClassSpellsSectionProps {
  rulesetId: string;
  classId: string;
  ruleset: {
    id: string;
    name: string;
    userId?: string | null;
    status?: string;
  };
}

const ORDINAL_SUFFIXES: Record<number, string> = {
  0: "0th",
  1: "1st",
  2: "2nd",
  3: "3rd",
};

function ordinal(n: number): string {
  return ORDINAL_SUFFIXES[n] ?? `${n}th`;
}

export function ClassSpellsSection({ rulesetId, classId }: ClassSpellsSectionProps) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.rulesets.classSpells(rulesetId, classId),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].classes[":classId"].spells.$get({
        param: { id: rulesetId, classId },
      });
      if (!response.ok) throw new Error("Failed to fetch spells");
      return response.json();
    },
  });

  // Derive spell level columns from the union of all spell levels in the data
  const spellLevelKeys = useMemo(() => {
    if (!data) return [];
    const allKeys = new Set<number>();
    for (const level of data) {
      for (const key of Object.keys(level.spellsPerDay)) {
        allKeys.add(Number(key));
      }
    }
    return [...allKeys].sort((a, b) => a - b);
  }, [data]);

  const hasSpells = spellLevelKeys.length > 0;

  const columns = useMemo(() => {
    if (!hasSpells) return [{ key: "level", label: "Level", width: "100%" }];
    const spellColumns = spellLevelKeys.map((sl) => ({
      key: `spell_${sl}`,
      label: ordinal(sl),
      width: `${Math.floor(80 / spellLevelKeys.length)}%`,
    }));
    return [
      { key: "level", label: "Level", width: "12%" },
      ...spellColumns,
    ];
  }, [spellLevelKeys, hasSpells]);

  const sortedData = useMemo(
    () => data?.sort((a, b) => a.level - b.level),
    [data],
  );

  const renderCell = (level: SpellLevel, columnKey: string) => {
    if (columnKey === "level") {
      return (
        <Chip
          label={level.level}
          size="small"
          color="primary"
        />
      );
    }

    if (columnKey.startsWith("spell_")) {
      const spellLevel = Number(columnKey.replace("spell_", ""));
      const value = level.spellsPerDay[spellLevel as keyof typeof level.spellsPerDay] as number | undefined;
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
        <Typography variant="h6">Spells per Day</Typography>
      </Box>

      <RulesetSectionTable
        data={hasSpells ? sortedData : undefined}
        isLoading={isLoading}
        columns={columns}
        renderCell={renderCell}
        emptyIcon={<SpellsIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
        emptyTitle="No spells"
        emptyDescription="This class doesn't have any spells per day data."
      />
    </Box>
  );
}
