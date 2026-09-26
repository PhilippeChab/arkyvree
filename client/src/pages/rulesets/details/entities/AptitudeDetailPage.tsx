import { useParams } from "react-router-dom";

import {
  AptitudeFormFields,
  type AptitudeFormData,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { RulesetEntityDetail } from "./RulesetEntityDetail.tsx";

export default function AptitudeDetailPage() {
  const { id: rulesetId = "", aptitudeId = "" } = useParams<{ id: string; aptitudeId: string }>();
  const param = { id: rulesetId, aptitudeId };
  const endpoint = rpc.api.rulesets[":id"].aptitudes[":aptitudeId"];

  return (
    <RulesetEntityDetail
      rulesetId={rulesetId}
      entityId={aptitudeId}
      section="aptitudes"
      label="Aptitude"
      fetchEntity={() => parseResponse(endpoint.$get({ param }))}
      editing={{
        toFormValues: (aptitude): AptitudeFormData => ({
          name: aptitude.name,
          description: aptitude.description ?? undefined,
        }),
        update: (data, updatedAt) => parseResponse(endpoint.$put({ param, json: { ...data, updatedAt } })),
        remove: () => endpoint.$delete({ param }),
        renderFields: (form) => <AptitudeFormFields form={form} />,
      }}
    />
  );
}
