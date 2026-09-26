import { Group as ContributorIcon } from "@mui/icons-material";
import { useParams } from "react-router-dom";

import { InviteLandingPage } from "@/client/src/components/invites/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

export default function CharacterContributorInvitePage() {
  const { contributorId = "" } = useParams<{ contributorId: string }>();
  const param = { param: { id: contributorId } };

  return (
    <InviteLandingPage
      pageTitle="Character Contributor Invite"
      entityLabel="Character"
      entityPath={(id) => `/characters/${id}`}
      listPath="/characters"
      icon={ContributorIcon}
      queryKey={queryKeys.invites.detail("characterContributor", contributorId)}
      loadInvite={async () => {
        const invite = await parseResponse(rpc.api.characters.contributors.invites[":id"].$get(param));
        return {
          status: invite.status,
          entityName: invite.charactersInCharacter?.name,
          entityId: invite.characterId,
          isArchived: !!invite.charactersInCharacter?.deletedAt,
          role: invite.role,
        };
      }}
      acceptInvite={() => rpc.api.characters.contributors.invites[":id"].accept.$post(param)}
      rejectInvite={() => rpc.api.characters.contributors.invites[":id"].reject.$post(param)}
      acceptedStatus="Active"
      joinVerb="contribute to"
      description="You've been invited to edit this character. Accepting will let you make changes and download the PDF."
      invalidateOnAccept={queryKeys.characters.lists}
    />
  );
}
