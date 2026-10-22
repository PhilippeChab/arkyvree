import { parseResponse } from "hono/client";
import { useParams } from "react-router-dom";

import {
  type EntityFormData,
  RulesetEntityFormFields,
  toEntityBody,
  toEntityForm,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { saveQuery } from "./entityDetailQueries.ts";
import { RulesetEntityDetail } from "./RulesetEntityDetail.tsx";

/** A save's page: its name, description and columns, as its rules describe them (the ability its bonus comes from). */
export default function SaveDetailsPage() {
  const { id: rulesetId = "", saveId = "" } = useParams<{ id: string; saveId: string }>();
  const param = { id: rulesetId, saveId };
  const endpoint = rpc.api.rulesets[":id"].saves[":saveId"];

  return (
    <RulesetEntityDetail
      rulesetId={rulesetId}
      entityId={saveId}
      section="saves"
      label="Save"
      query={(id) => saveQuery(rulesetId, id)}
      editing={(columns) => ({
        empty: toEntityForm<EntityFormData>(columns),
        toFormValues: (save) => toEntityForm<EntityFormData>(columns, save),
        updateFn: (data, updatedAt) =>
          parseResponse(
            endpoint.$put({
              param,
              json: { ...toEntityBody<EntityFormData, EntityFormData>(columns, data), updatedAt },
            }),
          ),
        removeFn: () => parseResponse(endpoint.$delete({ param })),
        renderFields: (form) => <RulesetEntityFormFields form={form} entityType="saves" rulesetId={rulesetId} />,
      })}
    />
  );
}
