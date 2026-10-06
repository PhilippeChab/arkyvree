import { Box, Chip, Typography } from "@mui/material";
import { useController, useForm } from "react-hook-form";

import { useFormSync, useRulesetSaves } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import {
  allLevelSaves,
  ClassLevelFields,
  featKey,
  type LevelFeat,
  levelFeatLabel,
  type LevelSave,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { ClassLevel } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

import type { EditorProps } from "./types.ts";
import { useEditorSave } from "./useEditorSave.ts";

interface ClassLevelForm {
  saves: LevelSave[];
  feats: LevelFeat[];
}

type LevelFeatRow = ClassLevel["feats"][number];

function asLevelFeat(feat: LevelFeatRow): LevelFeat {
  return { featId: feat.id, aptitudeId: feat.aptitudeId };
}
function featLabel(feat: LevelFeatRow) {
  return levelFeatLabel(feat.name, feat.aptitudeName);
}

/** Feats in the form's (label) order, like ClassLevelFields keeps them. */
function sortedFeats(level: ClassLevel) {
  return [...level.feats].sort((a, b) => featLabel(a).localeCompare(featLabel(b)));
}

function toClassLevelForm(level: ClassLevel): ClassLevelForm {
  return {
    saves: level.saves.map(({ saveId, base }) => ({ saveId, base })),
    feats: sortedFeats(level).map(asLevelFeat),
  };
}

export function ClassLevelEditor({
  rulesetId,
  entityId,
  recordKey,
  adoptKey,
  entity: level,
  canEdit,
  locked,
  onSaved,
}: EditorProps<ClassLevel>) {
  const form = useForm<ClassLevelForm>();
  const { field: saves } = useController({ control: form.control, name: "saves" });
  const { field: feats } = useController({ control: form.control, name: "feats" });
  const sync = useFormSync(form, toClassLevelForm(level), { key: recordKey, adoptKey });
  const { data: rulesetSaves } = useRulesetSaves(rulesetId);
  const saveMutation = useEditorSave({
    sync,
    entityId,
    onSaved,
    listKey: queryKeys.rulesets.classLevels(rulesetId, level.klassId),
    label: "Class level",
    save: (data: ClassLevelForm) =>
      parseResponse(
        rpc.api.rulesets[":id"].classes[":classId"].levels[":levelId"].$put({
          param: { id: rulesetId, classId: level.klassId, levelId: entityId },
          json: {
            saves: allLevelSaves(rulesetSaves, data.saves),
            feats: data.feats.map((feat) => ({ ...feat, free: true })),
          },
        }),
      ),
  });

  const saveName = (saveId: string) => rulesetSaves?.find((s) => s.id === saveId)?.name;

  return (
    <EntityDetailsCard
      title="Class Level Details"
      sx={{ mb: 4 }}
      chips={level.saves.map(
        (save) =>
          saveName(save.saveId) && (
            <Chip key={save.saveId} label={`${saveName(save.saveId)}: +${save.base}`} size="small" variant="outlined" />
          ),
      )}
      readOnlyBody={
        level.feats.length > 0 ? (
          <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {sortedFeats(level).map((feat) => (
              <Chip key={featKey(asLevelFeat(feat))} label={featLabel(feat)} size="small" variant="outlined" />
            ))}
          </Box>
        ) : (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            No feats at this level.
          </Typography>
        )
      }
      edit={
        canEdit
          ? {
              fields: (
                <ClassLevelFields
                  rulesetId={rulesetId}
                  saves={saves.value ?? []}
                  onSavesChange={saves.onChange}
                  feats={feats.value ?? []}
                  onFeatsChange={feats.onChange}
                  featLabels={new Map(level.feats.map((feat) => [featKey(asLevelFeat(feat)), featLabel(feat)]))}
                />
              ),
              onSubmit: sync.handleSubmit((data) => saveMutation.mutate(data)),
              canSave: form.formState.isDirty && !locked,
              isSaving: saveMutation.isPending,
            }
          : undefined
      }
    />
  );
}
