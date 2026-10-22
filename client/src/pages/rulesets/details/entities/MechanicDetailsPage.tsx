import { parseResponse } from "hono/client";
import { useParams } from "react-router-dom";

import {
  type EntityFormData,
  RulesetEntityFormFields,
  toEntityBody,
  toEntityForm,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { useEntityColumns } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { mechanicQuery } from "./entityDetailQueries.ts";
import { RulesetEntityDetail } from "./RulesetEntityDetail.tsx";

/** A mechanic's page: its name, and its description, a rule's whole text. */
export default function MechanicDetailsPage() {
  const { id: rulesetId = "", mechanicId = "" } = useParams<{ id: string; mechanicId: string }>();
  const param = { id: rulesetId, mechanicId };
  const endpoint = rpc.api.rulesets[":id"].mechanics[":mechanicId"];
  const { columns } = useEntityColumns(rulesetId, "mechanics");

  return (
    <RulesetEntityDetail
      rulesetId={rulesetId}
      entityId={mechanicId}
      section="mechanics"
      label="Mechanic"
      query={(id) => mechanicQuery(rulesetId, id)}
      editing={{
        empty: toEntityForm<EntityFormData>(columns),
        toFormValues: (mechanic) => toEntityForm<EntityFormData>(columns, mechanic),
        updateFn: (data, updatedAt) =>
          parseResponse(
            endpoint.$put({
              param,
              json: { ...toEntityBody<EntityFormData, EntityFormData>(columns, data), updatedAt },
            }),
          ),
        removeFn: () => parseResponse(endpoint.$delete({ param })),
        renderFields: (form) => (
          <RulesetEntityFormFields form={form} entityType="mechanics" rulesetId={rulesetId} descriptionRows={10} />
        ),
      }}
    />
  );
}
