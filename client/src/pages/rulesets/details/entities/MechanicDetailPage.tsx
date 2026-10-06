import { useParams } from "react-router-dom";

import {
  EMPTY_MECHANIC,
  type MechanicFormData,
  MechanicFormFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

import { mechanicQuery } from "./entityDetailQueries.ts";
import { RulesetEntityDetail } from "./RulesetEntityDetail.tsx";

export default function MechanicDetailPage() {
  const { id: rulesetId = "", mechanicId = "" } = useParams<{ id: string; mechanicId: string }>();
  const param = { id: rulesetId, mechanicId };
  const endpoint = rpc.api.rulesets[":id"].mechanics[":mechanicId"];

  return (
    <RulesetEntityDetail
      rulesetId={rulesetId}
      entityId={mechanicId}
      section="mechanics"
      label="Mechanic"
      query={(id) => mechanicQuery(rulesetId, id)}
      editing={{
        empty: EMPTY_MECHANIC,
        toFormValues: (mechanic): MechanicFormData => ({
          name: mechanic.name,
          description: mechanic.description ?? "",
        }),
        update: (data, updatedAt) => parseResponse(endpoint.$put({ param, json: { ...data, updatedAt } })),
        remove: () => endpoint.$delete({ param }),
        renderFields: (form) => <MechanicFormFields form={form} />,
      }}
    />
  );
}
