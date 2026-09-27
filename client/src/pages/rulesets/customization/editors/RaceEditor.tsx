import { Chip } from "@mui/material";
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useFormSync } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import { RaceFormFields, type RaceFormData } from "@/client/src/pages/rulesets/components/forms/index.ts";
import type { Race } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { editorKey, type EditorProps } from "./types.ts";

const toRaceForm = (race: Race): RaceFormData => ({
  name: race.name,
  description: race.description ?? "",
  size: race.size,
  baseSpeed: race.baseSpeed,
});

export function RaceEditor({ rulesetId, entityId, entity: race, canEdit, onSaved }: EditorProps<Race>) {
  const snackbar = useSnackbar();
  const form = useForm<RaceFormData>();
  const sync = useFormSync(form, toRaceForm(race), { key: editorKey(rulesetId, entityId), updatedAt: race.updatedAt });

  const saveMutation = useMutation({
    mutationFn: (data: RaceFormData) => parseResponse(rpc.api.rulesets[":id"].races[":raceId"].$put({
      param: { id: rulesetId, raceId: entityId },
      json: { ...data, updatedAt: sync.updatedAt() },
    })),
    onSuccess: (saved, submitted) => {
      sync.saved(submitted, saved.updatedAt);
      return onSaved(saved.id, queryKeys.rulesets.section(rulesetId, "races"), "Race updated");
    },
    onError: (err) => snackbar.error(err, "Failed to update race"),
  });

  return (
    <EntityDetailsCard
      title="Race Details"
      sx={{ mb: 4 }}
      description={race.description}
      chips={(
        <>
          <Chip label={race.size} size="small" color="secondary" sx={{ fontWeight: 600 }} />
          <Chip label={`${race.baseSpeed} ft`} size="small" color="info" variant="outlined" />
        </>
      )}
      edit={canEdit ? {
        fields: <RaceFormFields form={form} />,
        onSubmit: sync.handleSubmit((data) => saveMutation.mutate(data)),
        canSave: form.formState.isDirty,
        isSaving: saveMutation.isPending,
      } : undefined}
    />
  );
}
