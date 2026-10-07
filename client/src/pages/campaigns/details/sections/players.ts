import type { InferRequestType, InferResponseType } from "hono/client";

import type { rpc } from "@/client/src/services/rpc.ts";

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

/** The slot's latest invite, while it is still pending. */
function pendingInviteOf(player: CampaignPlayer): PendingInvite | undefined {
  // The API lists the latest invite first.
  const invite = player.invitesInCampaigns?.[0];
  return invite?.status === "Pending" ? invite : undefined;
}

/** Where a player slot stands, and its name: its user's, its invitee's, else what it is ("Unassigned Player Slot"). */
export function getPlayerSlot(player: CampaignPlayer): PlayerSlot {
  const pendingInvite = pendingInviteOf(player);
  const user = player.usersInAccount;
  if (player.userId && user?.id) return { state: "assigned", name: user.username ?? user.emailAddress, pendingInvite };

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

/** The name and email lines of a slot in the players list: the slot's one name, and its email when the name isn't it. */
export function playerDisplay(
  player: CampaignPlayer,
  slot = getPlayerSlot(player),
): { email: string | null | undefined; name: string } {
  const email =
    slot.state === "assigned"
      ? player.usersInAccount?.emailAddress
      : slot.state === "pending"
        ? (slot.pendingInvite.usersInAccount?.emailAddress ?? slot.pendingInvite.email)
        : "No player assigned";
  return { name: slot.name, email: email === slot.name ? undefined : email };
}

/** The request body for a player form: an empty email field means no invite. */
export function toPlayerPayload(data: PlayerFormData): PlayerFormData {
  return {
    ...data,
    email: data.email || undefined,
  };
}
