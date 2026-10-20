/**
 * The invites to the key's user as v1 answers them, each naming what it's to (a campaign, a character, a ruleset), and
 * what answering one leaves it.
 */

import type { z } from "zod";

import type {
  v1InviteStatus,
  v1ReceivedCampaignInvite,
  v1ReceivedCampaignInvites,
  v1ReceivedCharacterInvite,
  v1ReceivedRulesetInvite,
} from "@/server/routers/v1/schemas/invites.ts";
import type { CampaignInvitesService } from "@/server/services/campaigns/invites/index.ts";
import type { CharacterContributorsService } from "@/server/services/characters/contributors/index.ts";
import type { ContributorsService } from "@/server/services/rulesets/contributors/index.ts";

import type { Answer } from "./answers.ts";

/** An invite to the key's user to play in a campaign, in their list, read with its campaign. */
type ReceivedCampaignInvite = Extract<
  Answer<typeof CampaignInvitesService.getUserInvites>[number],
  { playersInCampaign: object }
>;

/** Whether an invite of the key's user's list was read with its campaign. */
function hasCampaign(
  invite: Answer<typeof CampaignInvitesService.getUserInvites>[number],
): invite is ReceivedCampaignInvite {
  return "playersInCampaign" in invite;
}

/** An invite, and the status its answer (an accept, a reject, a revoke) left it in. */
export function toV1InviteStatus({
  id,
  status,
}:
  | Answer<typeof CampaignInvitesService.acceptInvite>
  | Answer<typeof CampaignInvitesService.rejectInvite>
  | Answer<typeof CampaignInvitesService.revokeInvite>
  | Answer<typeof CharacterContributorsService.acceptInvite>
  | Answer<typeof CharacterContributorsService.rejectInvite>
  | Answer<typeof ContributorsService.acceptInvite>
  | Answer<typeof ContributorsService.rejectInvite>): z.infer<typeof v1InviteStatus> {
  return { id, status };
}

/** An invite to the key's user to play in a campaign: the campaign, and the slot's role. */
export function toV1ReceivedCampaignInvite(
  invite: Answer<typeof CampaignInvitesService.getInvite> | ReceivedCampaignInvite,
): z.infer<typeof v1ReceivedCampaignInvite> {
  const { campaignsInCampaign: campaign, role } = invite.playersInCampaign;
  return { campaign: { id: campaign.id, name: campaign.name }, id: invite.id, role, status: invite.status };
}

/** The latest invites to the key's user to play in a campaign, each read with its campaign. */
export function toV1ReceivedCampaignInvites(
  invites: Answer<typeof CampaignInvitesService.getUserInvites>,
): z.infer<typeof v1ReceivedCampaignInvites> {
  // The repository types its read with and without the campaign alike: the service's always has it
  return invites.filter(hasCampaign).map(toV1ReceivedCampaignInvite);
}

/** An invite to the key's user to contribute to a character. */
export function toV1ReceivedCharacterInvite(
  invite:
    | Answer<typeof CharacterContributorsService.getInvite>
    | Answer<typeof CharacterContributorsService.getUserInvites>[number],
): z.infer<typeof v1ReceivedCharacterInvite> {
  const { charactersInCharacter: character } = invite;
  return { character: { id: character.id, name: character.name }, id: invite.id, status: invite.status };
}

/** An invite to the key's user to contribute to a ruleset, and the role it offers. */
export function toV1ReceivedRulesetInvite(
  invite: Answer<typeof ContributorsService.getInvite> | Answer<typeof ContributorsService.getUserInvites>[number],
): z.infer<typeof v1ReceivedRulesetInvite> {
  const { rulesetsInRule: ruleset } = invite;
  return { id: invite.id, role: invite.role, ruleset: { id: ruleset.id, name: ruleset.name }, status: invite.status };
}
