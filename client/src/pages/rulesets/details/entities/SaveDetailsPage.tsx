import { parseResponse } from "hono/client";
import { useParams } from "react-router-dom";

import { LoadError, ValueChip } from "@/client/src/components/common/index.ts";
import { useRulesetAbilities } from "@/client/src/hooks/index.ts";
import { EMPTY_SAVE, type SaveFormData, SaveFormFields } from "@/client/src/pages/rulesets/components/forms/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { saveQuery } from "./entityDetailQueries.ts";
import { RulesetEntityDetail } from "./RulesetEntityDetail.tsx";

export default function SaveDetailsPage() {
  const { id: rulesetId = "", saveId = "" } = useParams<{ id: string; saveId: string }>();
  const param = { id: rulesetId, saveId };
  const endpoint = rpc.api.rulesets[":id"].saves[":saveId"];
  const { data: abilities = [], error: abilitiesError } = useRulesetAbilities(rulesetId);

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
        updateFn: (data, updatedAt) => parseResponse(endpoint.$put({ param, json: { ...data, updatedAt } })),
        removeFn: () => parseResponse(endpoint.$delete({ param })),
        renderFields: (form) => <SaveFormFields form={form} abilities={abilities} abilitiesError={abilitiesError} />,
      }}
      notice={!!abilitiesError && abilities.length === 0 && <LoadError what="Abilities" error={abilitiesError} />}
      renderChips={(save) => {
        const linkedAbilityName = abilities.find((a) => a.id === save.abilityId)?.name;
        return linkedAbilityName && <ValueChip label={linkedAbilityName} />;
      }}
    />
  );
}
