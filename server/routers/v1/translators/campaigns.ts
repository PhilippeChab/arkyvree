/**
 * A campaign as v1 answers it: what it is, its players and the invites sent for their slots, and its characters, each
 * as the key's user may see it.
 */

import type { z } from "zod";

import type {
  v1Campaign,
  v1CampaignCharacter,
  v1CampaignCharacterLink,
  v1CampaignCharacterSummary,
  v1CampaignInvite,
  v1CampaignPlayer,
  v1CampaignSummary,
  v1LinkableCharacter,
  v1PartialCharacter,
  v1PlayerSlot,
} from "@/server/routers/v1/schemas/campaigns.ts";
import type { CampaignCharactersService } from "@/server/services/campaigns/characters/index.ts";
import type { CampaignsService } from "@/server/services/campaigns/index.ts";
import type { CampaignInvitesService } from "@/server/services/campaigns/invites/index.ts";
import type { CampaignPlayersService } from "@/server/services/campaigns/players/index.ts";
import type { CharactersService } from "@/server/services/characters/index.ts";
import { CHARACTER_VISIBILITY_OPTIONS, type CharacterVisibility } from "@/shared/campaigns.ts";
import { isOneOf } from "@/shared/isOneOf.ts";

import type { Answer } from "./answers.ts";
import { toV1Character } from "./characters.ts";

/** An invite sent for a player slot, as its rows are stored. */
interface SlotInvite {
  email: string | null;
  id: string;
  status: string;
}

/** A character linked to a campaign, as its service answers it to the key's user. */
type CampaignCharacter = Answer<typeof CampaignCharactersService.getCharacter>;

/** A character linked to a campaign, whose identity alone the key's user sees. */
type PartialCampaignCharacter = Extract<CampaignCharacter, { identity: { meta: null } }>;

/** Whether the key's user sees a linked character's identity alone: its partial reading, which has no sheet. */
function isPartial(character: CampaignCharacter): character is PartialCampaignCharacter {
  return character.isPartial;
}

/** A partial reading of a character: its name, its race and its physical traits. */
function toPartialCharacter({ id, identity, name }: PartialCampaignCharacter): z.infer<typeof v1PartialCharacter> {
  const { age, gender, height, race, weight } = identity.physiology;
  return {
    id,
    identity: { age: age ?? null, gender, height: height ?? null, weight: weight ?? null },
    name,
    race: { id: race.id, name: race.name, size: race.size, speed: race.baseSpeed },
  };
}

/** An invite sent for a player slot, none when there's none. */
function toSlotInvite(invite: SlotInvite | null | undefined) {
  return invite ? { email: invite.email, id: invite.id, status: invite.status } : null;
}

/** A link's visibility, the column's check's: one it doesn't hold reads as the most hidden, `Private`. */
function toVisibility(visibility: string): CharacterVisibility {
  return isOneOf(visibility, CHARACTER_VISIBILITY_OPTIONS) ? visibility : "Private";
}

/** A campaign the key's user plays in, or is the Game Master of. */
export function toV1Campaign(campaign: Answer<typeof CampaignsService.getCampaign>): z.infer<typeof v1Campaign> {
  return { ...toV1CampaignSummary(campaign), role: campaign.currentUserRole };
}

/** A character linked to a campaign, as the key's user sees it: its sheet, or its identity alone. */
export function toV1CampaignCharacter(character: CampaignCharacter): z.infer<typeof v1CampaignCharacter> {
  const link = { own: character.isOwner, visibility: toVisibility(character.visibility) };
  if (isPartial(character)) return { ...link, partial: true, sheet: toPartialCharacter(character) };
  return { ...link, partial: false, sheet: toV1Character(character) };
}

/** A character of the key's user's linked to a campaign, as its link or its visibility's change leaves it. */
export function toV1CampaignCharacterLink(
  link:
    | Answer<typeof CampaignCharactersService.linkCharacter>
    | Answer<typeof CampaignCharactersService.updateCharacterVisibility>,
): z.infer<typeof v1CampaignCharacterLink> {
  return { characterId: link.characterId, visibility: toVisibility(link.visibility) };
}

/** A character linked to a campaign, in its list: its name and race, and its build unless it's partial. */
export function toV1CampaignCharacterSummary(
  character: Answer<typeof CampaignCharactersService.getCharacters>["items"][number],
): z.infer<typeof v1CampaignCharacterSummary> {
  return {
    classes: character.levels.map(({ klass, level }) => ({ level, name: klass })),
    id: character.id,
    level: character.totalLevel,
    name: character.name,
    own: character.isOwn,
    partial: character.isPartial,
    race: character.race,
    visibility: toVisibility(character.visibility),
  };
}

/** An invite to play in a campaign, as the campaign lists it: the slot it offers, and whom it was sent to. */
export function toV1CampaignInvite({
  invites,
  players,
  users,
}: Answer<typeof CampaignInvitesService.getInvites>["items"][number]): z.infer<typeof v1CampaignInvite> {
  return {
    email: invites.email,
    id: invites.id,
    player: { id: players.id, role: players.role },
    status: invites.status,
    user: users ? { id: users.id, username: users.username } : null,
  };
}

/** A player slot of a campaign, in its list: its role, its user, and the pending invite sent for it. */
export function toV1CampaignPlayer(
  player: Answer<typeof CampaignPlayersService.getPlayers>["items"][number],
): z.infer<typeof v1CampaignPlayer> {
  const { usersInAccount: user } = player;
  return {
    archived: player.deletedAt !== null,
    id: player.id,
    invite: toSlotInvite(player.invitesInCampaigns[0]),
    joinedAt: player.joinedAt,
    role: player.role,
    user: user ? { id: user.id, username: user.username } : null,
  };
}

/** A campaign in a list. */
export function toV1CampaignSummary(
  campaign: Answer<typeof CampaignsService.getCampaigns>["items"][number],
): z.infer<typeof v1CampaignSummary> {
  return {
    archived: campaign.deletedAt !== null,
    description: campaign.description,
    id: campaign.id,
    name: campaign.name,
    players: campaign.currentPlayers,
    ruleset: { id: campaign.rulesetId, name: campaign.rulesetName },
  };
}

/** A player character of the key's user's that a campaign could link. */
export function toV1LinkableCharacter({
  id,
  name,
}: Answer<typeof CharactersService.getUnlinkedCharacters>["items"][number]): z.infer<typeof v1LinkableCharacter> {
  return { id, name };
}

/** A player slot, as its add or its change leaves it: its role, its user, and the invite sent for it. */
export function toV1PlayerSlot({
  invite,
  player,
}: Answer<typeof CampaignPlayersService.addPlayer> | Answer<typeof CampaignPlayersService.updatePlayer>): z.infer<
  typeof v1PlayerSlot
> {
  return { id: player.id, invite: toSlotInvite(invite), role: player.role, userId: player.userId };
}
