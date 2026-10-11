import { Stack, Tooltip, Typography } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { AddButton, EmptyValue, ListToolbar, LoadError, ValueChip } from "@/client/src/components/common/index.ts";
import { LevelsIcon } from "@/client/src/components/icons/index.ts";
import { useRulesetPermissions } from "@/client/src/hooks/index.ts";
import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { getClassForms } from "@/client/src/pages/rulesets/details/classes/classFormFactory.ts";
import {
  type ClassLevelColumn,
  type ClassSectionProps,
  getClassSections,
} from "@/client/src/pages/rulesets/details/classes/classSectionFactory.ts";
import {
  type ClassLevelFormData,
  type ClassLevelRow,
  classLevelsQuery,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { CreateLevelDialog } from "@/client/src/pages/rulesets/details/classes/components/index.ts";
import { useOpenEntity, useRulesetSaves, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { buildCustomizationPath } from "@/shared/customization/entities.ts";
import { formatSigned } from "@/shared/text.ts";

import { useClassCopy } from "./useClassCopy.ts";

/** The feats' column's share of the table's width, in percent. */
const FEATS_SHARE = 28;

/** The level's number's column's share of the table's width, in percent. */
const LEVEL_SHARE = 8;

/** A base rules' level column as the table lays it out. */
function tableColumnOf({ key, label, share }: ClassLevelColumn) {
  return { key, label, width: `${share}%` };
}

export function ClassLevelsSection({ rulesetId, classId, className, ruleset }: ClassSectionProps) {
  const openEntity = useOpenEntity(rulesetId);
  const queryClient = useQueryClient();
  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  // Its base rules' columns of a level's own fields, around one column per ruleset save, which share the room left
  const { data: rulesetSaves, error: savesError } = useRulesetSaves(rulesetId);
  const { beforeSaves, afterSaves } = getClassSections(ruleset.baseRules).levelColumns;
  const rulesetColumns = [...beforeSaves, ...afterSaves];
  const savesShare =
    100 - LEVEL_SHARE - FEATS_SHARE - rulesetColumns.reduce((total, column) => total + column.share, 0);
  const levelsColumns = [
    { key: "level", label: "Level", width: `${LEVEL_SHARE}%` },
    ...beforeSaves.map(tableColumnOf),
    ...(rulesetSaves ?? []).map((save) => ({
      key: `save_${save.id}`,
      label: save.name,
      width: `${Math.floor(savesShare / Math.max(rulesetSaves?.length ?? 0, 1))}%`,
    })),
    ...afterSaves.map(tableColumnOf),
    { key: "feats", label: "Feats", width: `${FEATS_SHARE}%` },
  ];

  // A level added to an inherited class copies it: the page follows the copy, which takes the class's place in the list
  const { followCopy, queryKeysToInvalidate, tag } = useClassCopy(rulesetId, classId);

  const query = classLevelsQuery(rulesetId, classId);
  const { data: levels, isLoading, error } = useQuery(query);
  const { createDialogProps, handleCreate } = useRulesetSection({
    // Its create opens on the class's next level
    createDefaults: getClassForms(ruleset.baseRules).nextClassLevel(levels),
    rulesetId,
    label: "Class level",
    query,
    data: levels,
    queryKeysToInvalidate,
    createFn: async (level: ClassLevelFormData) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].classes[":classId"].levels.$post({ param: { id: rulesetId, classId }, json: level }),
        ),
      ),
    onCreateSuccess: (created) => followCopy(created.klassId, created.sourceEntityId),
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

    const rulesetColumn = rulesetColumns.find((column) => column.key === columnKey);
    if (rulesetColumn) return <Typography variant="body2">{rulesetColumn.valueOf(level)}</Typography>;

    switch (columnKey) {
      case "level":
        return <ValueChip label={level.level} color="primary" />;
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

      <CreateLevelDialog {...createDialogProps} rulesetId={rulesetId} baseRules={ruleset.baseRules} />
    </Stack>
  );
}
