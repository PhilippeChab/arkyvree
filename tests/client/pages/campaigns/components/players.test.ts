import { describe, expect, test } from "bun:test";

import { type CampaignPlayer, getPlayerSlot, playerDisplay } from "@/client/src/pages/campaigns/components/players.ts";

/** A player slot as the API lists it: its user, and its invites (the latest first). */
function player(
  user: { emailAddress: string; username: string | null } | null,
  invites: Partial<NonNullable<CampaignPlayer["invitesInCampaigns"]>[number]>[] = [],
) {
  return {
    id: "p1",
    userId: user && "u1",
    usersInAccount: user && { id: "u1", ...user },
    invitesInCampaigns: invites,
  } as unknown as CampaignPlayer;
}

// The slot's row and the dialogs that name it say the same name
describe("a player slot", () => {
  test("is named by its user, else its invitee, else what it is, wherever it's named", () => {
    const players = [
      player({ username: "ann", emailAddress: "ann@example.com" }),
      player({ username: null, emailAddress: "bob@example.com" }),
      player(null, [{ status: "Pending", email: "cy@example.com", usersInAccount: null }]),
      player(null),
    ];
    expect(players.map((p) => getPlayerSlot(p).name)).toEqual([
      "ann",
      "bob@example.com",
      "cy@example.com",
      "Unassigned Player Slot",
    ]);
    expect(players.map((p) => playerDisplay(p))).toEqual([
      { name: "ann", email: "ann@example.com" },
      { name: "bob@example.com", email: undefined },
      { name: "cy@example.com", email: undefined },
      { name: "Unassigned Player Slot", email: "No player assigned" },
    ]);
  });
});
