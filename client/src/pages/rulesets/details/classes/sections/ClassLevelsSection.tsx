import { Chip, Stack, Tooltip, Typography } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { AddButton, LoadError } from "@/client/src/components/common/index.ts";
import { LevelsIcon } from "@/client/src/components/icons/index.ts";
import { useRulesetSaves } from "@/client/src/hooks/index.ts";
import { formatSigned } from "@/client/src/lib/formatNumeric.ts";
import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { CreateLevelDialog } from "@/client/src/pages/rulesets/details/classes/components/index.ts";
import {
  type Level,
  useClassLevels,
  useOpenEntity,
  useRulesetPermissions,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { buildCustomizationPath } from "@/shared/customization/entities.ts";

import type { ClassSectionProps } from "./types.ts";

export function ClassLevelsSection({ rulesetId, classId, className, ruleset }: ClassSectionProps) {
  const openEntity = useOpenEntity(rulesetId);
  const queryClient = useQueryClient();
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  // One column per ruleset save.
  const { data: rulesetSaves, error: savesError } = useRulesetSaves(rulesetId);
  // Build dynamic columns based on ruleset saves
  const levelsColumns = useMemo(() => {
    const saveColumns = (rulesetSaves ?? []).map((save) => ({
      key: `save_${save.id}`,
      label: save.name,
      width: `${Math.floor(36 / Math.max(rulesetSaves?.length ?? 0, 1))}%`,
    }));
    return [
      { key: "level", label: "Level", width: "8%" },
      { key: "bab", label: "Base Attack Bonus", width: "15%" },
      ...saveColumns,
      { key: "skills", label: "Skill Points", width: "13%" },
      { key: "feats", label: "Feats", width: "28%" },
    ];
  }, [rulesetSaves]);

  const {
    levels,
    isLoading,
    error,
    createDialogOpen,
    setCreateDialogOpen,
    createForm,
    createMutation,
    handleCreate,
    confirmCreate,
  } = useClassLevels(rulesetId, classId);

  const handleRowClick = (level: Level) => {
    openEntity(buildCustomizationPath("klass_levels", level.id));
  };

  const handleRowMouseEnter = useCallback(
    (level: Level) => {
      void queryClient.prefetchQuery(customizationEntityQuery(rulesetId, "klass_levels", level.id));
    },
    [queryClient, rulesetId],
  );

  const renderCell = (level: Level, columnKey: string) => {
    if (columnKey.startsWith("save_")) {
      const saveId = columnKey.replace("save_", "");
      const levelSave = level.saves?.find((s) => s.saveId === saveId);
      return <Typography variant="body2">{formatSigned(levelSave?.base)}</Typography>;
    }

    switch (columnKey) {
      case "level":
        return <Chip label={level.level} size="small" color="primary" />;
      case "bab":
        return <Typography variant="body2">{formatSigned(level.bab)}</Typography>;
      case "skills":
        return <Typography variant="body2">{level.skills}</Typography>;
      case "feats":
        return (
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
            {level.feats && level.feats.length > 0 ? (
              level.feats.map((feat) => {
                const suffix = className ? ` (${className})` : "";
                const label = suffix && feat.name.endsWith(suffix) ? feat.name.slice(0, -suffix.length) : feat.name;
                return (
                  <Tooltip
                    describeChild
                    key={feat.id}
                    title={feat.description || ""}
                    arrow
                    placement="top"
                    enterDelay={300}
                    slotProps={{ tooltip: { sx: { maxWidth: 400 } } }}
                  >
                    <Chip label={label} size="small" variant="outlined" sx={{ fontSize: "0.75rem" }} />
                  </Tooltip>
                );
              })
            ) : (
              <Typography variant="body2" sx={{ color: "text.secondary" }}>
                —
              </Typography>
            )}
          </Stack>
        );
      default:
        return null;
    }
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="h6" component="h2">
          Class Levels
        </Typography>
        {canEdit && <AddButton label="Add Level" onClick={handleCreate} />}
      </Stack>

      {!!savesError && !rulesetSaves && <LoadError what="Saves" error={savesError} />}
      <RulesetSectionTable
        what="Levels"
        error={error}
        data={levels && [...levels].sort((a, b) => a.level - b.level)}
        isLoading={isLoading}
        columns={levelsColumns}
        onRowClick={handleRowClick}
        onRowMouseEnter={handleRowMouseEnter}
        renderCell={renderCell}
        emptyIcon={LevelsIcon}
        emptyTitle="No levels"
        emptyDescription={
          canEdit
            ? "Start by adding the first level for this class."
            : "This class doesn't have any levels defined yet."
        }
      />

      <CreateLevelDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        form={createForm}
        onSubmit={confirmCreate}
        isLoading={createMutation.isPending}
        rulesetId={rulesetId}
      />
    </Stack>
  );
}
