import { Chip } from "@mui/material";
import { useParams } from "react-router-dom";

import { useRulesetAbilities } from "@/client/src/hooks/index.ts";
import { EMPTY_SAVE, type SaveFormData, SaveFormFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

import { saveQuery } from "./entityDetailQueries.ts";
import { RulesetEntityDetail } from "./RulesetEntityDetail.tsx";

export default function SaveDetailPage() {
  const { id: rulesetId = "", saveId = "" } = useParams<{ id: string; saveId: string }>();
  const param = { id: rulesetId, saveId };
  const endpoint = rpc.api.rulesets[":id"].saves[":saveId"];
  const { data: abilities = [] } = useRulesetAbilities(rulesetId);

  return (
    <RulesetEntityDetail
      rulesetId={rulesetId}
      entityId={saveId}
      section="saves"
      label="Save"
      query={(id) => saveQuery(rulesetId, id)}
      editing={{
        empty: EMPTY_SAVE,
        toFormValues: (save): SaveFormData => ({
          name: save.name,
          description: save.description ?? "",
          abilityId: save.abilityId,
        }),
        update: (data, updatedAt) => parseResponse(endpoint.$put({ param, json: { ...data, updatedAt } })),
        remove: () => endpoint.$delete({ param }),
        renderFields: (form) => <SaveFormFields form={form} abilities={abilities} />,
      }}
      renderChips={(save) => {
        const linkedAbilityName = abilities.find((a) => a.id === save.abilityId)?.name;
        return linkedAbilityName && <Chip label={linkedAbilityName} color="secondary" sx={{ fontWeight: 600 }} />;
      }}
    />
  );
}
