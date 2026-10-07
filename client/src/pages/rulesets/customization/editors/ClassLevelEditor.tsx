import { Stack } from "@mui/material";
import { parseResponse } from "hono/client";
import { useController } from "react-hook-form";

import { BlankNote, ValueChip } from "@/client/src/components/common/index.ts";
import { useFormSync, useFormWith } from "@/client/src/hooks/index.ts";
import { formatSigned } from "@/client/src/lib/formatNumeric.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  allLevelSaves,
  areSaveBasesValid,
  ClassLevelFields,
  featKey,
  type LevelFeat,
  levelFeatLabel,
  type LevelSave,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { ClassLevel } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { useRulesetSaves } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { type EditorProps, useEditorSave } from "./useEditorSave.ts";

interface ClassLevelForm {
  feats: LevelFeat[];
  saves: LevelSave[];
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
  const form = useFormWith<ClassLevelForm>({ saves: [], feats: [] });
  const { field: saves, fieldState: savesState } = useController({
    control: form.control,
    name: "saves",
    rules: { validate: areSaveBasesValid },
  });
  const { field: feats } = useController({ control: form.control, name: "feats" });
  const sync = useFormSync(form, toClassLevelForm(level), { key: recordKey, adoptKey });
  const { data: rulesetSaves, error: savesError } = useRulesetSaves(rulesetId);
  const saveMutation = useEditorSave({
    sync,
    entityId,
    onSaved,
    listKey: QUERY_KEYS.rulesets.classLevels(rulesetId, level.klassId),
    label: "Class level",
    saveFn: (data: ClassLevelForm) =>
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
      chips={level.saves.map(
        (save) =>
          saveName(save.saveId) && (
            <ValueChip
              color="default"
              key={save.saveId}
              label={`${saveName(save.saveId)}: ${formatSigned(save.base)}`}
            />
          ),
      )}
      readOnlyBody={
        level.feats.length > 0 ? (
          <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
            {sortedFeats(level).map((feat) => (
              <ValueChip color="default" key={featKey(asLevelFeat(feat))} label={featLabel(feat)} />
            ))}
          </Stack>
        ) : (
          <BlankNote>No feats at this level</BlankNote>
        )
      }
      edit={
        canEdit
          ? {
              fields: (
                <ClassLevelFields
                  rulesetId={rulesetId}
                  rulesetSaves={rulesetSaves}
                  savesError={savesError}
                  saves={saves.value ?? []}
                  onSavesChange={saves.onChange}
                  savesInvalid={!!savesState.error}
                  feats={feats.value ?? []}
                  onFeatsChange={feats.onChange}
                  featLabels={new Map(level.feats.map((feat) => [featKey(asLevelFeat(feat)), featLabel(feat)]))}
                />
              ),
              onSubmit: sync.handleSubmit((data) => saveMutation.mutate(data)),
              canSave: sync.isDirty && !locked,
              isSaving: saveMutation.isPending,
            }
          : undefined
      }
    />
  );
}
