import { Group as ContributorIcon } from "@mui/icons-material";
import { useParams } from "react-router-dom";

import { InviteLandingPage } from "@/client/src/components/invites/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

export default function RulesetContributorInvitePage() {
  const { contributorId = "" } = useParams<{ contributorId: string }>();
  const param = { param: { id: contributorId } };

  return (
    <InviteLandingPage
      pageTitle="Ruleset Contributor Invite"
      entityLabel="Ruleset"
      entityPath={(id) => `/rulesets/${id}`}
      icon={ContributorIcon}
      queryKey={queryKeys.invites.detail("rulesetContributor", contributorId)}
      loadInvite={async () => {
        const invite = await parseResponse(rpc.api.rulesets.contributors.invites[":id"].$get(param));
        return {
          status: invite.status,
          entityName: invite.rulesetsInRule?.name,
          entityId: invite.rulesetId,
          isArchived: invite.rulesetsInRule?.status === "Archived",
          role: invite.role,
        };
      }}
      acceptInvite={() => rpc.api.rulesets.contributors.invites[":id"].accept.$post(param)}
      rejectInvite={() => rpc.api.rulesets.contributors.invites[":id"].reject.$post(param)}
      acceptedStatus="Active"
      joinVerb="contribute to"
      description="You've been invited to contribute to this ruleset. Would you like to accept or reject this invitation?"
      invalidateOnAccept={queryKeys.rulesets.lists}
    />
  );
}
