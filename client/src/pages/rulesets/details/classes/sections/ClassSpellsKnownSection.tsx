import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { AutoStories as SpellsIcon } from "@mui/icons-material";
import { Box, Chip, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useMemo } from "react";

type SpellsKnownResponse = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["spells-known"]["$get"]
>;
type SpellsKnownArray = Exclude<SpellsKnownResponse, { error: string }>;
type SpellKnownLevel = SpellsKnownArray[number];

interface ClassSpellsKnownSectionProps {
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

export function ClassSpellsKnownSection({ rulesetId, classId }: ClassSpellsKnownSectionProps) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.rulesets.classSpellsKnown(rulesetId, classId),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].classes[":classId"]["spells-known"].$get({
        param: { id: rulesetId, classId },
      });
      if (!response.ok) throw new Error("Failed to fetch spells known");
      return response.json();
    },
  });

  // Derive spell level columns from the union of all spell levels in the data
  const spellLevelKeys = useMemo(() => {
    if (!data) return [];
    const allKeys = new Set<number>();
    for (const level of data) {
      for (const key of Object.keys(level.spellsKnown)) {
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

  const renderCell = (level: SpellKnownLevel, columnKey: string) => {
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
      const value = level.spellsKnown[spellLevel as keyof typeof level.spellsKnown];
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
        <Typography variant="h6">Spells Known</Typography>
      </Box>

      <RulesetSectionTable
        data={hasSpells ? sortedData : undefined}
        isLoading={isLoading}
        columns={columns}
        renderCell={renderCell}
        emptyIcon={<SpellsIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
        emptyTitle="No spells known"
        emptyDescription="This class doesn't have any spells known data."
      />
    </Box>
  );
}
