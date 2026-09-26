import { Chip } from "@mui/material";
import { useParams } from "react-router-dom";

import {
  LanguageFormFields,
  type LanguageFormData,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { RulesetEntityDetail } from "./RulesetEntityDetail.tsx";

export default function LanguageDetailPage() {
  const { id: rulesetId = "", languageId = "" } = useParams<{ id: string; languageId: string }>();
  const param = { id: rulesetId, languageId };
  const endpoint = rpc.api.rulesets[":id"].languages[":languageId"];

  return (
    <RulesetEntityDetail
      rulesetId={rulesetId}
      entityId={languageId}
      section="languages"
      label="Language"
      fetchEntity={() => parseResponse(endpoint.$get({ param }))}
      editing={{
        toFormValues: (language): LanguageFormData => ({
          name: language.name,
          description: language.description ?? undefined,
          type: language.type,
        }),
        update: (data, updatedAt) => parseResponse(endpoint.$put({ param, json: { ...data, updatedAt } })),
        remove: () => endpoint.$delete({ param }),
        renderFields: (form) => <LanguageFormFields form={form} />,
      }}
      renderChips={(language) => language.type && (
        <Chip label={language.type} color="secondary" sx={{ fontWeight: 600 }} />
      )}
    />
  );
}
