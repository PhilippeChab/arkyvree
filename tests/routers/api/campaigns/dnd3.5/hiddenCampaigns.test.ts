import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Campaigns, PlayerCharacters, Players } from "@/server/repositories/index.ts";
import { type api, createSignedInUser, expectOk } from "@/tests/support/api.ts";
import { createTestCampaign, postCampaignInvite } from "@/tests/support/campaigns.ts";
import { addCharacterContributor } from "@/tests/support/contributors.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { NIL_UUID, uniqueId } from "@/tests/support/seed.ts";

/**
 * What a request under a campaign names: a character its Game Master linked to it (Public), and an empty player slot.
 */
interface Fixture {
  characterId: string;
  slotId: string;
}

type Client = typeof api;

/** A request that names a campaign by its id (`id`), as `client` asks it. */
type Request = (client: Client, id: string, fixture: Fixture) => Promise<{ json(): Promise<unknown>; status: number }>;

/** A user signed in through the API, as `createSignedInUser` makes one. */
type SignedIn = Awaited<ReturnType<typeof createSignedInUser>>;

/**
 * The campaign a request acts on: a live one or an archived one (a permanent delete takes either, its policy refusing a
 * live one).
 */
type State = "archived" | "live";

const HIDDEN = ["hidden", "hidden", "hidden", "hidden"];
const READ = ["read", "read", "read", "read"];

/** Every read a campaign's id gates, by name. */
const READS: [string, Request][] = [
  ["the campaign", (client, id) => client.api.campaigns[":id"].$get({ param: { id } })],
  ["its players", (client, id) => client.api.campaigns[":id"].players.$get({ param: { id }, query: {} })],
  ["its invites", (client, id) => client.api.campaigns[":id"].invites.$get({ param: { id }, query: {} })],
  ["its characters", (client, id) => client.api.campaigns[":id"].characters.$get({ param: { id }, query: {} })],
  [
    "one of its characters",
    (client, id, { characterId }) =>
      client.api.campaigns[":id"].characters[":characterId"].$get({ param: { id, characterId } }),
  ],
  [
    "the characters the session could link to it",
    (client, id) => client.api.characters.unlinked[":campaignId"].$get({ param: { campaignId: id }, query: {} }),
  ],
];

/**
 * Every write that names a campaign by its id, by name: what a Player of the campaign, who may not make it, gets (its
 * status), and whether it acts on a live campaign or an archived one.
 */
const WRITES: [string, Request, number, State][] = [
  [
    "an update",
    (client, id) => client.api.campaigns[":id"].$put({ param: { id }, json: { name: "Renamed" } }),
    403,
    "live",
  ],
  ["an archive", (client, id) => client.api.campaigns[":id"].$delete({ param: { id } }), 403, "live"],
  ["an unarchive", (client, id) => client.api.campaigns[":id"].unarchive.$post({ param: { id } }), 403, "archived"],
  [
    "a live campaign's permanent delete",
    (client, id) => client.api.campaigns[":id"].permanent.$delete({ param: { id } }),
    403,
    "live",
  ],
  [
    "a permanent delete",
    (client, id) => client.api.campaigns[":id"].permanent.$delete({ param: { id } }),
    403,
    "archived",
  ],
  [
    "a player's slot added",
    (client, id) => client.api.campaigns[":id"].players.$post({ param: { id }, json: { role: "Player Character" } }),
    403,
    "live",
  ],
  [
    "a player's slot added with an invite",
    (client, id) =>
      client.api.campaigns[":id"].players.$post({
        param: { id },
        json: { role: "Player Character", email: `invitee-${uniqueId()}@example.com` },
      }),
    403,
    "live",
  ],
  [
    "a player's slot changed",
    (client, id, { slotId }) =>
      client.api.campaigns[":id"].players[":playerId"].$put({
        param: { id, playerId: slotId },
        json: { role: "Game Master" },
      }),
    403,
    "live",
  ],
  [
    "a player's slot removed",
    (client, id, { slotId }) =>
      client.api.campaigns[":id"].players[":playerId"].$delete({ param: { id, playerId: slotId } }),
    403,
    "live",
  ],
  [
    "a character linked",
    (client, id, { characterId }) =>
      client.api.campaigns[":id"].characters.$post({ param: { id }, json: { characterId } }),
    403,
    "archived",
  ],
  [
    "a linked character's visibility",
    (client, id, { characterId }) =>
      client.api.campaigns[":id"].characters[":characterId"].$put({
        param: { id, characterId },
        json: { visibility: "Private" },
      }),
    403,
    "live",
  ],
  // Every refusal of an export is a 404, as for the character's own
  [
    "a linked character's PDF",
    (client, id, { characterId }) =>
      client.api.campaigns[":id"].characters[":characterId"].pdf.$post({ param: { id, characterId } }),
    404,
    "live",
  ],
];

/**
 * How the campaign's reads by its id (itself, its players, invites and characters) answer `client`: `read` (a 200),
 * `hidden` (the status and body the same read of an unknown id gets), or another status.
 */
async function readAnswers(client: Client, id: string): Promise<string[]> {
  const fixture = { characterId: NIL_UUID, slotId: NIL_UUID };
  const answers = [];
  for (const [, read] of READS.slice(0, 4)) {
    const answer = await read(client, id, fixture);
    const unknown = await read(client, NIL_UUID, fixture);
    const body = await answer.json();
    const hidden =
      answer.status === 404 && Bun.deepEquals([answer.status, body], [unknown.status, await unknown.json()]);
    answers.push(answer.status === 200 ? "read" : hidden ? "hidden" : String(answer.status));
  }
  return answers;
}

/** A campaign `gm` runs and `player` plays in, `state`, with a character its Game Master linked and an empty slot. */
async function setupCampaign(gm: SignedIn, player: SignedIn, state: State) {
  const { campaign, player: gmSeat } = await createTestCampaign(gm.user.id);
  await Players.create(db, { campaignId: campaign.id, userId: player.user.id, role: "Player Character" });
  const character = await createTestCharacter(gm.user.id);
  await PlayerCharacters.create(db, { playerId: gmSeat.id, characterId: character.id, visibility: "Public" });
  const [slot] = await Players.create(db, { campaignId: campaign.id, role: "Player Character" });
  if (state === "archived") await Campaigns.archive(db, { id: campaign.id });
  return { id: campaign.id, fixture: { characterId: character.id, slotId: slot.id } };
}

async function setupRequests(state: State = "live") {
  const gm = await createSignedInUser("gm");
  const player = await createSignedInUser("player");
  const stranger = await createSignedInUser("stranger");
  const { id, fixture } = await setupCampaign(gm, player, state);
  return { gm, player, stranger, id, fixture };
}

describe("every read a campaign's id gates", () => {
  test.each(READS)("%s: its members read it, a stranger gets the 404 an unknown campaign gets", async (_name, read) => {
    const { gm, player, stranger, id, fixture } = await setupRequests();

    expect((await read(gm.api, id, fixture)).status).toBe(200);
    expect((await read(player.api, id, fixture)).status).toBe(200);
    const hidden = await read(stranger.api, id, fixture);
    const unknown = await read(stranger.api, NIL_UUID, fixture);
    expect([hidden.status, await hidden.json()]).toEqual([unknown.status, await unknown.json()]);
    expect(hidden.status).toBe(404);
  });
});

describe("every write a campaign's id names", () => {
  test.each(WRITES)(
    "%s: a stranger gets what an unknown id gets, a member who may not make it is refused",
    async (_name, write, refused, state) => {
      const { player, stranger, id, fixture } = await setupRequests(state);

      const hidden = await write(stranger.api, id, fixture);
      const unknown = await write(stranger.api, NIL_UUID, fixture);
      expect([hidden.status, await hidden.json()]).toEqual([unknown.status, await unknown.json()]);
      expect(hidden.status).toBe(404);
      expect((await write(player.api, id, fixture)).status).toBe(refused);
    },
  );
});

describe("a linked character's PDF through the campaign", () => {
  test("its editor who isn't in the campaign gets what an unknown campaign gets", async () => {
    const { gm, stranger, id, fixture } = await setupRequests();
    await addCharacterContributor(fixture.characterId, stranger.user, gm.user.id);
    const [, pdf] = WRITES.find(([name]) => name === "a linked character's PDF")!;

    const hidden = await pdf(stranger.api, id, fixture);
    const unknown = await pdf(stranger.api, NIL_UUID, fixture);
    expect([hidden.status, await hidden.json()]).toEqual([unknown.status, await unknown.json()]);
    expect(hidden.status).toBe(404);
    expect(
      (await stranger.api.api.characters[":characterId"].pdf.$post({ param: { characterId: fixture.characterId } }))
        .status,
    ).toBe(202);
  });
});

describe("a campaign's reads by its id", () => {
  test("its members read it, archived or not", async () => {
    const { gm, player, id } = await setupRequests("archived");
    expect(await readAnswers(gm.api, id)).toEqual(READ);
    expect(await readAnswers(player.api, id)).toEqual(READ);
  });

  test("a removed player and a seat archived with its account don't", async () => {
    const { gm, id } = await setupRequests();
    const removed = await createSignedInUser("removed");
    const archivedSeat = await createSignedInUser("archived-seat");
    const [removedSeat] = await Players.create(db, {
      campaignId: id,
      userId: removed.user.id,
      role: "Player Character",
    });
    await expectOk(
      gm.api.api.campaigns[":id"].players[":playerId"].$delete({ param: { id, playerId: removedSeat.id } }),
    );
    await Players.create(db, { campaignId: id, userId: archivedSeat.user.id, role: "Player Character" });
    await Players.archive(db, { userId: archivedSeat.user.id });

    expect(await readAnswers(removed.api, id)).toEqual(HIDDEN);
    expect(await readAnswers(archivedSeat.api, id)).toEqual(HIDDEN);
  });
});

describe("a campaign invite", () => {
  test("its pending invitee reads it by its id, and the campaign only once they've accepted it", async () => {
    const gm = await createSignedInUser("gm");
    const invitee = await createSignedInUser("invitee");
    const { campaign, invite } = await postCampaignInvite(invitee.user.emailAddress, gm.api);
    const invites = invitee.api.api.campaigns.invites[":inviteId"];

    const read = await expectOk(invites.$get({ param: { inviteId: invite.id } }));
    expect(read.playersInCampaign.campaignsInCampaign).toMatchObject({ id: campaign.id, name: campaign.name });
    expect(await readAnswers(invitee.api, campaign.id)).toEqual(HIDDEN);

    expect(await expectOk(invites.accept.$post({ param: { inviteId: invite.id } }))).toMatchObject({
      campaignId: campaign.id,
    });
    expect(await readAnswers(invitee.api, campaign.id)).toEqual(READ);
  });

  test("its rejecting invitee reads it still, never the campaign", async () => {
    const gm = await createSignedInUser("gm");
    const invitee = await createSignedInUser("invitee");
    const { campaign, invite } = await postCampaignInvite(invitee.user.emailAddress, gm.api);
    const invites = invitee.api.api.campaigns.invites[":inviteId"];

    await expectOk(invites.reject.$post({ param: { inviteId: invite.id } }));
    expect(await expectOk(invites.$get({ param: { inviteId: invite.id } }))).toMatchObject({ status: "Rejected" });
    expect(await readAnswers(invitee.api, campaign.id)).toEqual(HIDDEN);
  });

  test("its revoke answers whoever may not read the campaign as an unknown invite, and a Player 403", async () => {
    const gm = await createSignedInUser("gm");
    const invitee = await createSignedInUser("invitee");
    const player = await createSignedInUser("player");
    const stranger = await createSignedInUser("stranger");
    const { campaign, invite } = await postCampaignInvite(invitee.user.emailAddress, gm.api);
    await Players.create(db, { campaignId: campaign.id, userId: player.user.id, role: "Player Character" });
    const revoke = (client: Client, inviteId: string): ReturnType<Request> =>
      client.api.campaigns.invites[":inviteId"].revoke.$post({ param: { inviteId } });

    for (const { api: client } of [stranger, invitee]) {
      const hidden = await revoke(client, invite.id);
      const unknown = await revoke(client, NIL_UUID);
      expect([hidden.status, await hidden.json()]).toEqual([unknown.status, await unknown.json()]);
      expect(hidden.status).toBe(404);
    }
    expect((await revoke(player.api, invite.id)).status).toBe(403);
  });
});
