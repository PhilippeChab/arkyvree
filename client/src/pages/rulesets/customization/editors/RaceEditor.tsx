import { parseResponse } from "hono/client";

import { ValueChip } from "@/client/src/components/common/index.ts";
import { useFormSync, useFormWith } from "@/client/src/hooks/index.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  EMPTY_RACE,
  type RaceFormData,
  RaceFormFields,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { Race } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { useEntityFields, useEntitySave } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import type { EditorProps } from "./renderEditor.tsx";

function toRaceForm(race: Race, fields: readonly EntityField[] | undefined): RaceFormData {
  const values: RaceFormData = {
    name: race.name,
    description: race.description ?? "",
    size: race.size,
    baseSpeed: race.baseSpeed,
  };
  return withEntityFields(values, fields, race);
}

export function RaceEditor({
  rulesetId,
  entityId,
  recordKey,
  adoptKey,
  entity: race,
  canEdit,
  locked,
  followCopy,
  refetchSaved,
}: EditorProps<Race>) {
  const form = useFormWith<RaceFormData>(EMPTY_RACE);
  const { fields } = useEntityFields(rulesetId, "races");
  const sync = useFormSync(form, toRaceForm(race, fields), { key: recordKey, adoptKey, updatedAt: race.updatedAt });
  const saveMutation = useEntitySave({
    rulesetId,
    entityId,
    sync,
    followCopy,
    storeSaved: refetchSaved,
    listKey: QUERY_KEYS.rulesets.section(rulesetId, "races"),
    label: "Race",
    saveFn: (data: RaceFormData, updatedAt: string | undefined) =>
      parseResponse(
        rpc.api.rulesets[":id"].races[":raceId"].$put({
          param: { id: rulesetId, raceId: entityId },
          json: { ...data, updatedAt },
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
              fields: <RaceFormFields form={form} rulesetId={rulesetId} />,
              onSubmit: sync.handleSubmit((data) => saveMutation.mutate(data)),
              canSave: sync.isDirty && !locked,
              isSaving: saveMutation.isPending,
            }
          : undefined
      }
    />
  );
}
