import type { InferRequestType, InferResponseType } from "hono/client";
import type { ElementType } from "react";

import { CharacterIcon, GMIcon } from "@/client/src/components/icons/index.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import type { CampaignRole } from "@/shared/enums.ts";

type PendingInvite = NonNullable<CampaignPlayer["invitesInCampaigns"]>[number];

type PlayersApi = (typeof rpc.api.campaigns)[":id"]["players"];

export type CampaignPlayer = InferResponseType<PlayersApi["$get"], 200>["items"][number];

/** The Add / Edit Player form. The edit request takes the same body. */
export type PlayerFormData = InferRequestType<PlayersApi["$post"]>["json"];

/**
 * Where a player slot stands, with its one name, which its row and its dialogs give it. A pending
 * slot always has its invite; an assigned one can still have one out.
 */
export type PlayerSlot =
  | { name: string; pendingInvite?: PendingInvite; state: "assigned" }
  | { name: string; pendingInvite: PendingInvite; state: "pending" }
  | { name: string; pendingInvite?: undefined; state: "unassigned" };

export type PlayerState = PlayerSlot["state"];

/** Each role's icon, wherever a role shows: a player's chip, the role's choice in its dialogs. */
export const ROLE_ICONS = {
  "Game Master": GMIcon,
  "Player Character": CharacterIcon,
} as const satisfies Record<CampaignRole, ElementType>;

/** The slot's pending invite: the API lists its latest pending one alone. */
function pendingInviteOf(player: CampaignPlayer): PendingInvite | undefined {
  return player.invitesInCampaigns?.[0];
}

/**
 * Where a player slot stands, and its name: its user's, its invitee's, else what it is ("Unassigned Player Slot"). A
 * user without a username is named by their address, which a player doesn't read: "Unnamed Player" then.
 */
export function getPlayerSlot(player: CampaignPlayer): PlayerSlot {
  const pendingInvite = pendingInviteOf(player);
  const user = player.usersInAccount;
  if (player.userId && user?.id)
    return { state: "assigned", name: user.username ?? user.emailAddress ?? "Unnamed Player", pendingInvite };

  if (pendingInvite) {
    const invitee = pendingInvite.usersInAccount;
    return {
      state: "pending",
      name: invitee?.username ?? invitee?.emailAddress ?? pendingInvite.email ?? "Invited User",
      pendingInvite,
    };
  }
  return { state: "unassigned", name: "Unassigned Player Slot" };
}

/**
 * The two lines of a slot in the players list: the slot's one name, and under it its email when the name isn't it, or
 * what an empty slot is ("No player assigned").
 */
export function playerDisplay(
  player: CampaignPlayer,
  slot = getPlayerSlot(player),
): { caption: string | null | undefined; name: string } {
  const caption =
    slot.state === "assigned"
      ? player.usersInAccount?.emailAddress
      : slot.state === "pending"
        ? (slot.pendingInvite.usersInAccount?.emailAddress ?? slot.pendingInvite.email)
        : "No player assigned";
  return { name: slot.name, caption: caption === slot.name ? undefined : caption };
}

/** The request body for a player form: an empty email field means no invite. */
export function toPlayerPayload(data: PlayerFormData): PlayerFormData {
  return {
    ...data,
    email: data.email || undefined,
  };
}
