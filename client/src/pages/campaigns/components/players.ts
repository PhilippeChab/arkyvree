import type { InferRequestType, InferResponseType } from "hono/client";

import type { RPC } from "@/client/src/services/rpc.ts";

type PlayersApi = RPC["api"]["campaigns"][":id"]["players"];

/** The Add / Edit Player form. The edit request takes the same body. */
export type PlayerFormData = InferRequestType<PlayersApi["$post"]>["json"];

export type CampaignPlayer = InferResponseType<PlayersApi["$get"], 200>["items"][number];

export type PendingInvite = NonNullable<CampaignPlayer["invitesInCampaigns"]>[number];

/**
 * Where a player slot stands, with the name the dialogs give it. A pending
 * slot always has its invite; an assigned one can still have one out.
 */
export type PlayerSlot =
  | { state: "assigned"; name: string; pendingInvite?: PendingInvite }
  | { state: "pending"; name: string; pendingInvite: PendingInvite }
  | { state: "unassigned"; name: string; pendingInvite?: undefined };

export type PlayerState = PlayerSlot["state"];

/** The slot's latest invite, while it is still pending. */
function pendingInviteOf(player: CampaignPlayer): PendingInvite | undefined {
  // The API lists the latest invite first.
  const invite = player.invitesInCampaigns?.[0];
  return invite?.status === "Pending" ? invite : undefined;
}

export function getPlayerSlot(player: CampaignPlayer): PlayerSlot {
  const pendingInvite = pendingInviteOf(player);
  const user = player.usersInAccount;
  if (player.userId && user?.id) {
    return { state: "assigned", name: user.username ?? user.emailAddress, pendingInvite };
  }
  if (pendingInvite) {
    const invitee = pendingInvite.usersInAccount;
    return {
      state: "pending",
      name: invitee?.username ?? invitee?.emailAddress ?? pendingInvite.email ?? "invited user",
      pendingInvite,
    };
  }
  return { state: "unassigned", name: "this player" };
}

/** The name and email lines of a slot in the players list. */
export function playerDisplay(
  player: CampaignPlayer,
  slot = getPlayerSlot(player),
): { name: string; email: string | null | undefined } {
  switch (slot.state) {
    case "assigned":
      return {
        name: player.usersInAccount?.username ?? `Player ${player.id.slice(0, 4)}`,
        email: player.usersInAccount?.emailAddress,
      };
    case "pending": {
      const invite = slot.pendingInvite;
      return {
        name: invite.usersInAccount?.username ?? invite.email ?? `User ${invite.userId?.slice(0, 4)}`,
        email: invite.usersInAccount?.emailAddress ?? invite.email,
      };
    }
    case "unassigned":
      return { name: "Unassigned Player Slot", email: "No player assigned" };
  }
}

/** The request body for a player form: an empty email field means no invite. */
export const toPlayerPayload = (data: PlayerFormData): PlayerFormData => ({
  ...data,
  email: data.email || undefined,
});
