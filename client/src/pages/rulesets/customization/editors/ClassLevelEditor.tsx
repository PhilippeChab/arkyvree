import { Box, Chip, Typography } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useFormSync, useRulesetSaves } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import {
  allLevelSaves,
  ClassLevelFields,
  type LevelFeat,
  type LevelSave,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import type { ClassLevel } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { editorKey, type EditorProps } from "./types.ts";

interface ClassLevelForm {
  saves: LevelSave[];
  feats: LevelFeat[];
}

const toClassLevelForm = (level: ClassLevel): ClassLevelForm => ({
  saves: level.saves.map(({ saveId, base }) => ({ saveId, base })),
  feats: level.feats.map((feat) => ({ featId: feat.id, aptitudeId: feat.aptitudeId })),
});

const featLabel = (feat: ClassLevel["feats"][number]) => `${feat.name} (${feat.aptitudeName ?? "Unknown"})`;

export function ClassLevelEditor({ rulesetId, entityId, entity: level, canEdit, onSaved }: EditorProps<ClassLevel>) {
  const snackbar = useSnackbar();
  const form = useForm<ClassLevelForm>();
  const sync = useFormSync(form, toClassLevelForm(level), { key: editorKey(rulesetId, entityId) });
  const { data: rulesetSaves = [] } = useRulesetSaves(rulesetId);

  const saveMutation = useMutation({
    mutationFn: (data: ClassLevelForm) => parseResponse(rpc.api.rulesets[":id"].classes[":classId"].levels[":levelId"].$put({
      param: { id: rulesetId, classId: level.klassId, levelId: entityId },
      json: {
        saves: allLevelSaves(rulesetSaves, data.saves),
        feats: data.feats.map((feat) => ({ ...feat, free: true })),
      },
    })),
    onSuccess: (saved, submitted) => {
      sync.saved(submitted);
      return onSaved(saved.id, queryKeys.rulesets.classLevels(rulesetId, level.klassId), "Class level updated");
    },
    onError: (err) => snackbar.error(err, "Failed to update class level"),
  });

  const saveName = (saveId: string) => rulesetSaves.find((s) => s.id === saveId)?.name;

  return (
    <EntityDetailsCard
      title="Class Level Details"
      sx={{ mb: 4 }}
      chips={level.saves.map((save) => saveName(save.saveId) && (
        <Chip key={save.saveId} label={`${saveName(save.saveId)}: +${save.base}`} size="small" variant="outlined" />
      ))}
      readOnlyBody={level.feats.length > 0 ? (
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
          {level.feats.map((feat) => (
            <Chip key={`${feat.id}-${feat.aptitudeId}`} label={featLabel(feat)} size="small" variant="outlined" />
          ))}
        </Box>
      ) : (
        <Typography variant="body2" sx={{ color: "text.secondary" }}>No feats at this level.</Typography>
      )}
      edit={canEdit ? {
        fields: (
          <ClassLevelFields
            rulesetId={rulesetId}
            saves={form.watch("saves") ?? []}
            onSavesChange={(saves) => form.setValue("saves", saves, { shouldDirty: true })}
            feats={form.watch("feats") ?? []}
            onFeatsChange={(feats) => form.setValue("feats", feats, { shouldDirty: true })}
            featLabels={new Map(level.feats.map((feat) => [`${feat.id}-${feat.aptitudeId}`, featLabel(feat)]))}
          />
        ),
        onSubmit: sync.handleSubmit((data) => saveMutation.mutate(data)),
        canSave: form.formState.isDirty,
        isSaving: saveMutation.isPending,
      } : undefined}
    />
  );
}
