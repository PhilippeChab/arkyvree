import { parseResponse } from "hono/client";
import { useParams } from "react-router-dom";

import { InviteIcon } from "@/client/src/components/icons/index.ts";
import { InviteLandingPage } from "@/client/src/components/invites/index.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

export default function CampaignInvitePage() {
  const { inviteId = "" } = useParams<{ inviteId: string }>();
  const param = { param: { inviteId } };

  return (
    <InviteLandingPage
      pageTitle="Campaign Invite"
      entityLabel="Campaign"
      entityPath={(id) => `/campaigns/${id}`}
      listPath="/campaigns"
      icon={InviteIcon}
      queryKey={QUERY_KEYS.invites.detail("campaign", inviteId)}
      inviteFn={async () => {
        const invite = await parseResponse(rpc.api.campaigns.invites[":inviteId"].$get(param));
        const campaign = invite.playersInCampaign?.campaignsInCampaign;
        return {
          status: invite.status,
          entityName: campaign?.name,
          entityId: campaign?.id,
          isArchived: !!campaign?.deletedAt,
          invitedAt: invite.createdAt,
        };
      }}
      acceptFn={() => parseResponse(rpc.api.campaigns.invites[":inviteId"].accept.$post(param))}
      rejectFn={() => parseResponse(rpc.api.campaigns.invites[":inviteId"].reject.$post(param))}
      acceptedStatus="Accepted"
      joinVerb="join"
      description="You've been invited to join this campaign. Would you like to accept or reject this invitation?"
      invalidateOnAccept={QUERY_KEYS.campaigns.lists}
    />
  );
}
