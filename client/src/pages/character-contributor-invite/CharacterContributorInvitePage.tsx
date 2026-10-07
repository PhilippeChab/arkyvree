import { parseResponse } from "hono/client";
import { useParams } from "react-router-dom";

import { ContributorsIcon } from "@/client/src/components/icons/index.ts";
import { InviteLandingPage } from "@/client/src/components/invites/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";

export default function CharacterContributorInvitePage() {
  const { contributorId = "" } = useParams<{ contributorId: string }>();
  const param = { param: { id: contributorId } };

  return (
    <InviteLandingPage
      pageTitle="Character Contributor Invite"
      entityLabel="Character"
      entityPath={(id) => `/characters/${id}`}
      listPath="/characters"
      icon={ContributorsIcon}
      kind="characterContributor"
      inviteId={contributorId}
      inviteFn={async () => {
        const invite = await parseResponse(rpc.api.characters.contributors.invites[":id"].$get(param));
        return {
          status: invite.status,
          entityName: invite.charactersInCharacter?.name,
          entityId: invite.characterId,
          isArchived: !!invite.charactersInCharacter?.deletedAt,
          role: invite.role,
        };
      }}
      acceptedStatus="Active"
      joinVerb="contribute to"
      description="You've been invited to edit this character. Accepting will let you make changes and download the PDF."
    />
  );
}
