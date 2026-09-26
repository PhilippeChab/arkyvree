import { useParams } from "react-router-dom";

import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { RulesetEntityDetail } from "./RulesetEntityDetail.tsx";

export default function AbilityDetailPage() {
  const { id: rulesetId = "", abilityId = "" } = useParams<{ id: string; abilityId: string }>();

  return (
    <RulesetEntityDetail
      rulesetId={rulesetId}
      entityId={abilityId}
      section="abilities"
      label="Ability"
      fetchEntity={() => parseResponse(rpc.api.rulesets[":id"].abilities[":abilityId"].$get({
        param: { id: rulesetId, abilityId },
      }))}
    />
  );
}
