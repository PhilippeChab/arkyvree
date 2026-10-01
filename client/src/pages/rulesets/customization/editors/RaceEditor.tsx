import { Chip } from "@mui/material";
import { useForm } from "react-hook-form";

import { useFormSync } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import { type RaceFormData, RaceFormFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import type { Race } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import type { EditorProps } from "./types.ts";
import { useEditorSave } from "./useEditorSave.ts";

const toRaceForm = (race: Race): RaceFormData => ({
  name: race.name,
  description: race.description ?? "",
  size: race.size,
  baseSpeed: race.baseSpeed,
});

export function RaceEditor({ rulesetId, entityId, recordKey, adoptKey, entity: race, canEdit, locked, onSaved }: EditorProps<Race>) {
  const form = useForm<RaceFormData>();
  const sync = useFormSync(form, toRaceForm(race), { key: recordKey, adoptKey, updatedAt: race.updatedAt });
  const saveMutation = useEditorSave({
    sync,
    entityId,
    onSaved,
    listKey: queryKeys.rulesets.section(rulesetId, "races"),
    label: "Race",
    save: (data: RaceFormData) => parseResponse(rpc.api.rulesets[":id"].races[":raceId"].$put({
      param: { id: rulesetId, raceId: entityId },
      json: { ...data, updatedAt: sync.updatedAt() },
    })),
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
        canSave: form.formState.isDirty && !locked,
        isSaving: saveMutation.isPending,
      } : undefined}
    />
  );
}
