import { parseResponse } from "hono/client";
import { useParams } from "react-router-dom";

import {
  type EntityFormData,
  RulesetEntityFormFields,
  toEntityBody,
  toEntityForm,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { aptitudeQuery } from "./entityDetailQueries.ts";
import { RulesetEntityDetail } from "./RulesetEntityDetail.tsx";

/** An aptitude's page: its name and description. */
export default function AptitudeDetailsPage() {
  const { id: rulesetId = "", aptitudeId = "" } = useParams<{ aptitudeId: string; id: string }>();
  const param = { id: rulesetId, aptitudeId };
  const endpoint = rpc.api.rulesets[":id"].aptitudes[":aptitudeId"];

  return (
    <RulesetEntityDetail
      rulesetId={rulesetId}
      entityId={aptitudeId}
      section="aptitudes"
      label="Aptitude"
      query={(id) => aptitudeQuery(rulesetId, id)}
      editing={(columns) => ({
        empty: toEntityForm<EntityFormData>(columns),
        toFormValues: (aptitude) => toEntityForm<EntityFormData>(columns, aptitude),
        updateFn: (data, updatedAt) =>
          parseResponse(
            endpoint.$put({
              param,
              json: { ...toEntityBody<EntityFormData, EntityFormData>(columns, data), updatedAt },
            }),
          ),
        removeFn: () => parseResponse(endpoint.$delete({ param })),
        renderFields: (form) => <RulesetEntityFormFields form={form} entityType="aptitudes" rulesetId={rulesetId} />,
      })}
    />
  );
}
