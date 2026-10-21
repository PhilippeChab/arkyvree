import { parseResponse } from "hono/client";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  type RaceFormData,
  RaceFormFields,
  toEntityBody,
  toEntityForm,
  withEntityFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import type { Race } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import { useEntityColumns, useEntityFields, useEntityForm } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import type { EditorProps } from "./renderEditor.tsx";

/** A race's form: its name, description and columns (`columns`, its rules'), and its fields. */
function toRaceForm(
  race: Race,
  columns: readonly EntityField[],
  fields: readonly EntityField[] | undefined,
): RaceFormData {
  return withEntityFields(toEntityForm<RaceFormData>(columns, race), fields, race);
}

export function RaceEditor({
  rulesetId,
  entityId,
  recordKey,
  adoptKey,
  entity: race,
  locked,
  followCopy,
  refetchSaved,
}: EditorProps<Race>) {
  const { fields } = useEntityFields(rulesetId, "races");
  const { columns } = useEntityColumns(rulesetId, "races");
  const { form, save } = useEntityForm({
    empty: toEntityForm<RaceFormData>(columns),
    values: toRaceForm(race, columns, fields),
    formKey: recordKey,
    adoptKey,
    updatedAt: race.updatedAt,
    locked,
    rulesetId,
    entityId,
    followCopy,
    storeSaved: refetchSaved,
    listKey: QUERY_KEYS.rulesets.section(rulesetId, "races"),
    label: "Race",
    saveFn: (data: RaceFormData, updatedAt: string | undefined) =>
      parseResponse(
        rpc.api.rulesets[":id"].races[":raceId"].$put({
          param: { id: rulesetId, raceId: entityId },
          json: { ...toEntityBody<RaceFormData, RaceFormData>(columns, data), updatedAt },
        }),
      ),
  });

  return (
    <EntityDetailsCard
      title="Race Details"
      form={{
        fields: <RaceFormFields form={form} rulesetId={rulesetId} />,
        ...save,
      }}
    />
  );
}
