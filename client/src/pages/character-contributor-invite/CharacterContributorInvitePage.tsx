import { useParams } from "react-router-dom";

import { InviteLandingPage } from "@/client/src/components/invites/index.ts";

export default function CharacterContributorInvitePage() {
  const { contributorId = "" } = useParams<{ contributorId: string }>();
  return <InviteLandingPage kind="characterContributor" inviteId={contributorId} />;
}
