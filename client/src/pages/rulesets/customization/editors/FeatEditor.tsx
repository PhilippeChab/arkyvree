import { Chip } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useFormSync } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import { FeatFormFields, type FeatFormData } from "@/client/src/pages/rulesets/components/forms/index.ts";
import type { Feat } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { editorKey, type EditorProps } from "./types.ts";
import { useAptitudeLookup } from "./useAptitudeLookup.ts";

const featAptitudes = (feat: Feat) => feat.featsAptitudesInRules.flatMap((fa) => fa.aptitudesInRule ?? []);

const toFeatForm = (feat: Feat): FeatFormData => ({
  name: feat.name,
  description: feat.description ?? "",
  aptitudeIds: featAptitudes(feat).map((a) => a.id),
});

export function FeatEditor({ rulesetId, entityId, entity: feat, canEdit, onSaved }: EditorProps<Feat>) {
  const snackbar = useSnackbar();
  const form = useForm<FeatFormData>();
  const sync = useFormSync(form, toFeatForm(feat), { key: editorKey(rulesetId, entityId), updatedAt: feat.updatedAt });
  const aptitudes = useAptitudeLookup(featAptitudes(feat));

  const saveMutation = useMutation({
    mutationFn: (data: FeatFormData) => parseResponse(rpc.api.rulesets[":id"].feats[":featId"].$put({
      param: { id: rulesetId, featId: entityId },
      json: { ...data, updatedAt: sync.updatedAt() },
    })),
    onSuccess: (saved, submitted) => {
      sync.saved(submitted, saved.updatedAt);
      return onSaved(saved.id, queryKeys.rulesets.section(rulesetId, "feats"), "Feat updated");
    },
    onError: (err) => snackbar.error(err, "Failed to update feat"),
  });

  return (
    <EntityDetailsCard
      title="Feat Details"
      sx={{ mb: 4 }}
      description={feat.description}
      chips={featAptitudes(feat).map((apt) => (
        <Chip key={apt.id} label={apt.name} size="small" color="primary" variant="outlined" />
      ))}
      edit={canEdit ? {
        fields: (
          <FeatFormFields
            form={form}
            rulesetId={rulesetId}
            selectedAptitudes={aptitudes.resolve(form.watch("aptitudeIds") ?? [])}
            onAptitudesChange={(selected) => {
              aptitudes.remember(selected);
              form.setValue("aptitudeIds", selected.map((a) => a.id), { shouldDirty: true });
            }}
          />
        ),
        onSubmit: sync.handleSubmit((data) => saveMutation.mutate(data)),
        canSave: form.formState.isDirty,
        isSaving: saveMutation.isPending,
      } : undefined}
    />
  );
}
