import {
  CreateLevelDialog,
} from "@/client/src/pages/rulesets/details/classes/components/index.ts";
import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { useClassLevels, usePermissions } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { Add as AddIcon, FormatListNumbered as LevelsIcon } from "@mui/icons-material";
import { Box, Button, Chip, Tooltip, Typography } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";

type LevelsResponse = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["levels"]["$get"]
>;
type LevelsArray = Exclude<LevelsResponse, { error: string }>;
type Level = LevelsArray[number];

interface ClassLevelsSectionProps {
  rulesetId: string;
  classId: string;
  className?: string;
  ruleset: {
    id: string;
    name: string;
    userId?: string | null;
    status?: string;
  };
}

export function ClassLevelsSection({ rulesetId, classId, className, ruleset }: ClassLevelsSectionProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id);
  const { canEdit } = usePermissions(ruleset, currentUserId);

  // Fetch saves for dynamic columns
  const { data: savesData } = useQuery({
    queryKey: queryKeys.rulesets.section(rulesetId, "saves"),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"]["saves"]["$get"]({
        param: { id: rulesetId },
        query: { limit: "100", page: "1" },
      });
      if (!response.ok) throw new Error("Failed to fetch saves");
      return response.json();
    },
  });
  // Build dynamic columns based on ruleset saves
  const levelsColumns = useMemo(() => {
    const rulesetSaves = savesData?.items ?? [];
    const saveColumns = rulesetSaves.map((save) => ({
      key: `save_${save.id}`,
      label: save.name,
      width: `${Math.floor(36 / Math.max(rulesetSaves.length, 1))}%`,
    }));
    return [
      { key: "level", label: "Level", width: "8%" },
      { key: "bab", label: "Base Attack Bonus", width: "15%" },
      ...saveColumns,
      { key: "skills", label: "Skill Points", width: "13%" },
      { key: "feats", label: "Feats", width: "28%" },
    ];
  }, [savesData?.items]);

  const {
    levels,
    isLoading,
    createDialogOpen,
    setCreateDialogOpen,
    createForm,
    createMutation,
    handleCreate,
    confirmCreate,
  } = useClassLevels(rulesetId, classId);

  const handleRowClick = (level: Level) => {
    navigate(`/rulesets/${rulesetId}/klass_levels/${level.id}/customization`);
  };

  const handleRowMouseEnter = useCallback((level: Level) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.entity(rulesetId, "klass_levels", level.id),
      queryFn: async () => {
        const response = await rpc.api.rulesets[":id"].class_levels[":classLevelId"].$get({
          param: { id: rulesetId, classLevelId: level.id },
        });
        if (!response.ok) throw new Error("Failed to fetch class level");
        return response.json();
      },
    });
  }, [queryClient, rulesetId]);

  const renderCell = (level: Level, columnKey: string) => {
    if (columnKey.startsWith("save_")) {
      const saveId = columnKey.replace("save_", "");
      const levelSave = level.saves?.find((s: { saveId: string; base: number }) => s.saveId === saveId);
      return (
        <Typography variant="body2">
          +{levelSave?.base ?? 0}
        </Typography>
      );
    }

    switch (columnKey) {
      case "level":
        return (
          <Chip
            label={level.level}
            size="small"
            color="primary"
          />
        );
      case "bab":
        return (
          <Typography variant="body2">
            +{level.bab}
          </Typography>
        );
      case "skills":
        return (
          <Typography variant="body2">
            {level.skills}
          </Typography>
        );
      case "feats":
        return (
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {level.feats && level.feats.length > 0
              ? level.feats.map((feat: { id: string; name: string; description?: string | null }) => {
                const suffix = className ? ` (${className})` : "";
                const label = suffix && feat.name.endsWith(suffix)
                  ? feat.name.slice(0, -suffix.length)
                  : feat.name;
                return (
                <Tooltip
                  key={feat.id}
                  title={feat.description || ""}
                  arrow
                  placement="top"
                  enterDelay={300}
                  slotProps={{ tooltip: { sx: { maxWidth: 400 } } }}
                >
                  <Chip
                    label={label}
                    size="small"
                    variant="outlined"
                    sx={{ fontSize: "0.75rem" }}
                  />
                </Tooltip>
                );
              })
              : (
                <Typography variant="body2" sx={{
                  color: "text.secondary"
                }}>
                  —
                </Typography>
              )}
          </Box>
        );
      default:
        return null;
    }
  };

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
        <Typography variant="h6">Class Levels</Typography>
        {canEdit && (
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleCreate}
          >
            Add Level
          </Button>
        )}
      </Box>

      <RulesetSectionTable
        data={levels?.sort((a, b) => a.level - b.level)}
        isLoading={isLoading}
        columns={levelsColumns}
        onRowClick={handleRowClick}
        onRowMouseEnter={handleRowMouseEnter}
        renderCell={renderCell}
        emptyIcon={<LevelsIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
        emptyTitle="No levels"
        emptyDescription={canEdit
          ? "Start by adding the first level for this class."
          : "This class doesn't have any levels defined yet."}
      />

      <CreateLevelDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        form={createForm}
        onSubmit={confirmCreate}
        isLoading={createMutation.isPending}
        rulesetId={rulesetId}
      />

    </Box>
  );
}
