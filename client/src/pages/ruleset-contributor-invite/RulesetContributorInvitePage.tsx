import { parseResponse } from "hono/client";
import { useParams } from "react-router-dom";

import { ContributorIcon } from "@/client/src/components/icons/index.ts";
import { InviteLandingPage } from "@/client/src/components/invites/index.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

export default function RulesetContributorInvitePage() {
  const { contributorId = "" } = useParams<{ contributorId: string }>();
  const param = { param: { id: contributorId } };

  return (
    <InviteLandingPage
      pageTitle="Ruleset Contributor Invite"
      entityLabel="Ruleset"
      entityPath={(id) => `/rulesets/${id}`}
      listPath="/rulesets"
      icon={ContributorIcon}
      queryKey={QUERY_KEYS.invites.detail("rulesetContributor", contributorId)}
      inviteFn={async () => {
        const invite = await parseResponse(rpc.api.rulesets.contributors.invites[":id"].$get(param));
        return {
          status: invite.status,
          entityName: invite.rulesetsInRule?.name,
          entityId: invite.rulesetId,
          isArchived: invite.rulesetsInRule?.status === "Archived",
          role: invite.role,
        };
      }}
      acceptFn={() => parseResponse(rpc.api.rulesets.contributors.invites[":id"].accept.$post(param))}
      rejectFn={() => parseResponse(rpc.api.rulesets.contributors.invites[":id"].reject.$post(param))}
      acceptedStatus="Active"
      joinVerb="contribute to"
      description="You've been invited to contribute to this ruleset. Would you like to accept or reject this invitation?"
      invalidateOnAccept={QUERY_KEYS.rulesets.lists}
    />
  );
}
