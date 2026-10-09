import { Stack, Tooltip, Typography } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { AddButton, EmptyValue, ListToolbar, LoadError, ValueChip } from "@/client/src/components/common/index.ts";
import { LevelsIcon } from "@/client/src/components/icons/index.ts";
import { formatSigned } from "@/client/src/lib/formatNumeric.ts";
import { type ClassLevelFormData, nextClassLevel } from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import {
  type ClassLevelRow,
  classLevelsQuery,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { CreateLevelDialog } from "@/client/src/pages/rulesets/details/classes/components/index.ts";
import {
  useOpenEntity,
  useRulesetPermissions,
  useRulesetSaves,
  useRulesetSection,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { buildCustomizationPath } from "@/shared/customization/entities.ts";

import type { ClassSectionProps } from "./classSections.ts";

export function ClassLevelsSection({ rulesetId, classId, className, ruleset }: ClassSectionProps) {
  const openEntity = useOpenEntity(rulesetId);
  const queryClient = useQueryClient();
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  // One column per ruleset save, sharing the room the saves take
  const { data: rulesetSaves, error: savesError } = useRulesetSaves(rulesetId);
  const levelsColumns = [
    { key: "level", label: "Level", width: "8%" },
    { key: "bab", label: "Base Attack Bonus", width: "15%" },
    ...(rulesetSaves ?? []).map((save) => ({
      key: `save_${save.id}`,
      label: save.name,
      width: `${Math.floor(36 / Math.max(rulesetSaves?.length ?? 0, 1))}%`,
    })),
    { key: "skills", label: "Skill Points", width: "13%" },
    { key: "feats", label: "Feats", width: "28%" },
  ];

  const query = classLevelsQuery(rulesetId, classId);
  const { data: levels, isLoading, error } = useQuery(query);
  const { createDialogProps, handleCreate } = useRulesetSection({
    // Its create opens on the class's next level
    createDefaults: nextClassLevel(levels),
    rulesetId,
    label: "Class level",
    query,
    data: levels,
    createFn: async (level: ClassLevelFormData) =>
      parseResponse(
        rpc.api.rulesets[":id"].classes[":classId"].levels.$post({ param: { id: rulesetId, classId }, json: level }),
      ),
  });

  const handleRowClick = (level: ClassLevelRow) => {
    openEntity(buildCustomizationPath("klass_levels", level.id));
  };

  const handleRowMouseEnter = (level: ClassLevelRow) => {
    void queryClient.prefetchQuery(customizationEntityQuery(rulesetId, "klass_levels", level.id));
  };

  const renderCell = (level: ClassLevelRow, columnKey: string) => {
    if (columnKey.startsWith("save_")) {
      const saveId = columnKey.replace("save_", "");
      const levelSave = level.saves?.find((s) => s.saveId === saveId);
      return <Typography variant="body2">{formatSigned(levelSave?.base)}</Typography>;
    }

    switch (columnKey) {
      case "level":
        return <ValueChip label={level.level} color="primary" />;
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
                    placement="top"
                    enterDelay={300}
                    slotProps={{ tooltip: { sx: { maxWidth: 400 } } }}
                  >
                    <ValueChip color="default" label={label} />
                  </Tooltip>
                );
              })
            ) : (
              <EmptyValue />
            )}
          </Stack>
        );
      default:
        return null;
    }
  };

  return (
    <Stack spacing={3}>
      {canEdit && <ListToolbar actions={<AddButton label="Add Level" onClick={handleCreate} />} />}

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

      <CreateLevelDialog {...createDialogProps} rulesetId={rulesetId} />
    </Stack>
  );
}
