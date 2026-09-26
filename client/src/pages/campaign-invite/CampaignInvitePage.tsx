import { Mail as InviteIcon } from "@mui/icons-material";
import { useParams } from "react-router-dom";

import { InviteLandingPage } from "@/client/src/components/invites/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

export default function CampaignInvitePage() {
  const { inviteId = "" } = useParams<{ inviteId: string }>();
  const param = { param: { inviteId } };

  return (
    <InviteLandingPage
      pageTitle="Campaign Invite"
      entityLabel="Campaign"
      entityPath={(id) => `/campaigns/${id}`}
      icon={InviteIcon}
      queryKey={queryKeys.invites.detail("campaign", inviteId)}
      loadInvite={async () => {
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
      acceptInvite={() => rpc.api.campaigns.invites[":inviteId"].accept.$post(param)}
      rejectInvite={() => rpc.api.campaigns.invites[":inviteId"].reject.$post(param)}
      acceptedStatus="Accepted"
      joinVerb="join"
      description="You've been invited to join this campaign. Would you like to accept or reject this invitation?"
      invalidateOnAccept={queryKeys.campaigns.lists}
    />
  );
}
