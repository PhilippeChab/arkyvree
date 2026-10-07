import { parseResponse } from "hono/client";

import { ValueChip } from "@/client/src/components/common/index.ts";
import { useFormSync, useFormWith } from "@/client/src/hooks/index.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { EMPTY_RACE, type RaceFormData, RaceFormFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { Race } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

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
    listKey: QUERY_KEYS.rulesets.section(rulesetId, "races"),
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
      description={race.description}
      chips={
        <>
          <ValueChip label={race.size} />
          <ValueChip label={`${race.baseSpeed} ft`} color="info" />
        </>
      }
      edit={
        canEdit
          ? {
              fields: <RaceFormFields form={form} />,
              onSubmit: sync.handleSubmit((data) => saveMutation.mutate(data)),
              canSave: sync.isDirty && !locked,
              isSaving: saveMutation.isPending,
            }
          : undefined
      }
    />
  );
}
