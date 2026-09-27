import { Chip } from "@mui/material";
import { useForm } from "react-hook-form";

import { useFormSync } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import { byName, FeatFormFields, type FeatFormData } from "@/client/src/pages/rulesets/components/forms/index.ts";
import type { Feat } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import type { EditorProps } from "./types.ts";
import { useEditorSave } from "./useEditorSave.ts";

const featAptitudes = (feat: Feat) =>
  feat.featsAptitudesInRules.flatMap((fa) => fa.aptitudesInRule ?? []).sort(byName);

const toFeatForm = (feat: Feat): FeatFormData => ({
  name: feat.name,
  description: feat.description ?? "",
  aptitudeIds: featAptitudes(feat).map((a) => a.id),
});

export function FeatEditor({ rulesetId, entityId, recordKey, adoptKey, entity: feat, canEdit, locked, onSaved }: EditorProps<Feat>) {
  const form = useForm<FeatFormData>();
  const sync = useFormSync(form, toFeatForm(feat), { key: recordKey, adoptKey, updatedAt: feat.updatedAt });
  const saveMutation = useEditorSave({
    sync,
    entityId,
    onSaved,
    listKey: queryKeys.rulesets.section(rulesetId, "feats"),
    label: "Feat",
    save: (data: FeatFormData) => parseResponse(rpc.api.rulesets[":id"].feats[":featId"].$put({
      param: { id: rulesetId, featId: entityId },
      json: { ...data, updatedAt: sync.updatedAt() },
    })),
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
        fields: <FeatFormFields form={form} rulesetId={rulesetId} knownAptitudes={featAptitudes(feat)} />,
        onSubmit: sync.handleSubmit((data) => saveMutation.mutate(data)),
        canSave: form.formState.isDirty && !locked,
        isSaving: saveMutation.isPending,
      } : undefined}
    />
  );
}
