/**
 * A campaign's player slots and invites with their email addresses left out, for a reader the campaign's policy says
 * may not read them (`CampaignsPolicy.isAddressReader`, `isSlotAddressReader`): they read who's who by name.
 */

import type { Invites, Players } from "@/server/repositories/index.ts";

/** An invite as its campaign's list reads it. */
type InviteRow = Awaited<ReturnType<typeof Invites.findPage>>["items"][number];

/** A player slot as its campaign's list reads it. */
type PlayerRow = Awaited<ReturnType<typeof Players.findPage>>["items"][number];

/** A user as a player reads them: their name, their address left out. */
function withoutAddress<U extends { emailAddress: string | null }>(user: U | null) {
  return user && { ...user, emailAddress: null };
}

/** An invite as a player reads it: whom it went to by name, its addresses left out. */
export function redactInviteAddresses(invite: InviteRow) {
  return { ...invite, invites: { ...invite.invites, email: null }, users: withoutAddress(invite.users) };
}

/**
 * A player slot as one who may not read its addresses reads it: its user's and its invites' addresses left out. The
 * row is named whole so its addresses read nullable to the app.
 */
export function redactPlayerAddresses<P extends PlayerRow>(player: P) {
  return {
    ...player,
    invitesInCampaigns: player.invitesInCampaigns.map((invite) => ({
      ...invite,
      email: null,
      usersInAccount: withoutAddress(invite.usersInAccount),
    })),
    usersInAccount: withoutAddress(player.usersInAccount),
  };
}
