import { TagChip } from "@/client/src/components/common/index.ts";
import { useFormSync, useFormWith } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { EMPTY_RACE, type RaceFormData, RaceFormFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailsCard, raceSizeTag } from "@/client/src/pages/rulesets/components/index.ts";
import type { Race } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

import type { EditorProps } from "./types.ts";
import { useEditorSave } from "./useEditorSave.ts";

function toRaceForm(race: Race): RaceFormData {
  return {
    name: race.name,
    description: race.description ?? "",
    size: race.size,
    baseSpeed: race.baseSpeed,
  };
}

export function RaceEditor({
  rulesetId,
  entityId,
  recordKey,
  adoptKey,
  entity: race,
  canEdit,
  locked,
  onSaved,
}: EditorProps<Race>) {
  const form = useFormWith<RaceFormData>(EMPTY_RACE);
  const sync = useFormSync(form, toRaceForm(race), { key: recordKey, adoptKey, updatedAt: race.updatedAt });
  const saveMutation = useEditorSave({
    sync,
    entityId,
    onSaved,
    listKey: queryKeys.rulesets.section(rulesetId, "races"),
    label: "Race",
    saveFn: (data: RaceFormData) =>
      parseResponse(
        rpc.api.rulesets[":id"].races[":raceId"].$put({
          param: { id: rulesetId, raceId: entityId },
          json: { ...data, updatedAt: sync.updatedAt() },
        }),
      ),
  });

  return (
    <EntityDetailsCard
      title="Race Details"
      sx={{ mb: 4 }}
      description={race.description}
      chips={
        <>
          <TagChip tag={raceSizeTag(race.size)} />
          <TagChip tag={{ label: `${race.baseSpeed} ft`, color: "info", tooltip: "Base speed" }} />
        </>
      }
      edit={
        canEdit
          ? {
              fields: <RaceFormFields form={form} />,
              onSubmit: sync.handleSubmit((data) => saveMutation.mutate(data)),
              canSave: form.formState.isDirty && !locked,
              isSaving: saveMutation.isPending,
            }
          : undefined
      }
    />
  );
}
