import { describe, expect, test } from "bun:test";

import {
  type CampaignPlayer,
  getPlayerSlot,
  playerDisplay,
} from "@/client/src/pages/campaigns/details/sections/players.ts";

/** A player slot as the API lists it: its user, and its invites (the latest first). */
function player(
  user: { emailAddress: string | null; username: string | null } | null,
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
      { name: "ann", caption: "ann@example.com" },
      { name: "bob@example.com", caption: undefined },
      { name: "cy@example.com", caption: undefined },
      { name: "Unassigned Player Slot", caption: "No player assigned" },
    ]);
  });

  test("is named for a player who doesn't read the addresses of those without a username", () => {
    const players = [
      player({ username: null, emailAddress: null }),
      player(null, [
        { status: "Pending", email: null, usersInAccount: { id: "u2", emailAddress: null, username: null } },
      ]),
    ];
    expect(players.map((p) => playerDisplay(p))).toEqual([
      { name: "Unnamed Player", caption: null },
      { name: "Invited User", caption: null },
    ]);
  });
});
