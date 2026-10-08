import { useParams } from "react-router-dom";

import { InviteLandingPage } from "@/client/src/components/invites/index.ts";

export default function CampaignInvitePage() {
  const { inviteId = "" } = useParams<{ inviteId: string }>();
  return <InviteLandingPage kind="campaign" inviteId={inviteId} />;
}
