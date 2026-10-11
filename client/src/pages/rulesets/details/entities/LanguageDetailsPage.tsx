import { parseResponse } from "hono/client";
import { useParams } from "react-router-dom";

import { ValueChip } from "@/client/src/components/common/index.ts";
import {
  EMPTY_LANGUAGE,
  type LanguageFormData,
  LanguageFormFields,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { languageQuery } from "./entityDetailQueries.ts";
import { RulesetEntityDetail } from "./RulesetEntityDetail.tsx";

export default function LanguageDetailsPage() {
  const { id: rulesetId = "", languageId = "" } = useParams<{ id: string; languageId: string }>();
  const param = { id: rulesetId, languageId };
  const endpoint = rpc.api.rulesets[":id"].languages[":languageId"];

  return (
    <RulesetEntityDetail
      rulesetId={rulesetId}
      entityId={languageId}
      section="languages"
      label="Language"
      query={(id) => languageQuery(rulesetId, id)}
      editing={{
        empty: EMPTY_LANGUAGE,
        toFormValues: (language): LanguageFormData => ({
          name: language.name,
          description: language.description ?? "",
          type: language.type,
        }),
        updateFn: (data, updatedAt) => parseResponse(endpoint.$put({ param, json: { ...data, updatedAt } })),
        removeFn: () => parseResponse(endpoint.$delete({ param })),
        renderFields: (form) => <LanguageFormFields form={form} />,
      }}
      renderChips={(language) => language.type && <ValueChip label={language.type} />}
    />
  );
}
