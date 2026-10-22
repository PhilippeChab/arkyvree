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

import { languageQuery } from "./entityDetailQueries.ts";
import { RulesetEntityDetail } from "./RulesetEntityDetail.tsx";

/** A language's page: its name, description and columns, as its rules describe them (its type). */
export default function LanguageDetailsPage() {
  const { id: rulesetId = "", languageId = "" } = useParams<{ id: string; languageId: string }>();
  const param = { id: rulesetId, languageId };
  const endpoint = rpc.api.rulesets[":id"].languages[":languageId"];
  const { columns } = useEntityColumns(rulesetId, "languages");

  return (
    <RulesetEntityDetail
      rulesetId={rulesetId}
      entityId={languageId}
      section="languages"
      label="Language"
      query={(id) => languageQuery(rulesetId, id)}
      editing={{
        empty: toEntityForm<EntityFormData>(columns),
        toFormValues: (language) => toEntityForm<EntityFormData>(columns, language),
        updateFn: (data, updatedAt) =>
          parseResponse(
            endpoint.$put({
              param,
              json: { ...toEntityBody<EntityFormData, EntityFormData>(columns, data), updatedAt },
            }),
          ),
        removeFn: () => parseResponse(endpoint.$delete({ param })),
        renderFields: (form) => <RulesetEntityFormFields form={form} entityType="languages" rulesetId={rulesetId} />,
      }}
    />
  );
}
