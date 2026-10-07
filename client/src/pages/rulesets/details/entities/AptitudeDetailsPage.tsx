import { parseResponse } from "hono/client";
import { useParams } from "react-router-dom";

import {
  type AptitudeFormData,
  AptitudeFormFields,
  EMPTY_APTITUDE,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { aptitudeQuery } from "./entityDetailQueries.ts";
import { RulesetEntityDetail } from "./RulesetEntityDetail.tsx";

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
      editing={{
        empty: EMPTY_APTITUDE,
        toFormValues: (aptitude): AptitudeFormData => ({
          name: aptitude.name,
          description: aptitude.description ?? "",
        }),
        update: (data, updatedAt) => parseResponse(endpoint.$put({ param, json: { ...data, updatedAt } })),
        remove: () => endpoint.$delete({ param }),
        renderFields: (form) => <AptitudeFormFields form={form} />,
      }}
    />
  );
}
