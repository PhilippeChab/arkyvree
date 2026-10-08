import { useParams } from "react-router-dom";

import { InviteLandingPage } from "@/client/src/components/invites/index.ts";

export default function RulesetContributorInvitePage() {
  const { contributorId = "" } = useParams<{ contributorId: string }>();
  return <InviteLandingPage kind="rulesetContributor" inviteId={contributorId} />;
}
