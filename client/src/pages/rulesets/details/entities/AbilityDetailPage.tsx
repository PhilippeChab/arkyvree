import { useParams } from "react-router-dom";

import { abilityQuery } from "./entityDetailQueries.ts";
import { RulesetEntityDetail } from "./RulesetEntityDetail.tsx";

export default function AbilityDetailPage() {
  const { id: rulesetId = "", abilityId = "" } = useParams<{ id: string; abilityId: string }>();

  return (
    <RulesetEntityDetail
      rulesetId={rulesetId}
      entityId={abilityId}
      section="abilities"
      label="Ability"
      query={(id) => abilityQuery(rulesetId, id)}
    />
  );
}
