import { afterAll, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";
import type { PoolClient } from "pg";

import { charactersInCharacter, invitesInCampaign } from "@/drizzle/schema.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { createTestDbFromClient, createTestPool, runOnConnection } from "@/server/database/test.ts";
import { UnauthorizedError } from "@/server/errors/index.ts";
import {
  Campaigns,
  CharacterContributors,
  Characters,
  Contributors,
  Invites,
  Locks,
  PlayerCharacters,
  Players,
  Rulesets,
  toDeletedAddress,
  Users,
  Visibility,
} from "@/server/repositories/index.ts";
import { AccountService } from "@/server/services/authentication/account/index.ts";
import { CampaignPlayersService } from "@/server/services/campaigns/players/index.ts";
import { CharacterContributorsService } from "@/server/services/characters/contributors/index.ts";
import { ContributorsService } from "@/server/services/rulesets/contributors/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { withAccountDeletion } from "@/server/services/writes/index.ts";
import type { CampaignRole } from "@/shared/enums.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { CommittedUsers } from "@/tests/support/CommittedUsers.ts";
import { waitUntilWaiting } from "@/tests/support/database.ts";
import { createCharacterAs, createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { findSeededCharacter, getSeedCtx, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser, makeSession } from "@/tests/support/users.ts";

/** The campaigns the probes committed, deleted before their users, after the file's tests. */
const committedCampaigns: string[] = [];

const pool = createTestPool();

/** The demo users the probes committed, deleted after the campaigns. */
const users = new CommittedUsers(pool);

/** An account's deletion, as a call `runQueued` runs. */
function deletion(userId: string) {
  return () => AccountService.deleteAccount(makeSession(userId), "password1234");
}

/**
 * A campaign of a seat of each of `roles`, its accounts' seats joined in their order, each with a character linked to
 * it, committed: rows the test's own transaction wrote would hold their accounts' keys, which a deletion waits for as
 * it overwrites its account's address.
 */
async function commitParty(...roles: CampaignRole[]) {
  const accounts: Awaited<ReturnType<CommittedUsers["commit"]>>[] = [];
  for (const _role of roles) accounts.push(await users.commit("deleted"));
  const client = await pool.connect();
  try {
    return await runOnConnection(client, async () => {
      const name = `Party ${uniqueId()}`;
      const [campaign] = await Campaigns.create(db, { name, rulesetId: (await getSeedCtx()).rulesetId });
      committedCampaigns.push(campaign.id);
      const seats = [];
      for (const [index, role] of roles.entries()) {
        const user = accounts[index];
        const [seat] = await Players.create(db, { campaignId: campaign.id, role, userId: user.id });
        const character = await createTestCharacter(user.id);
        await PlayerCharacters.create(db, { characterId: character.id, playerId: seat.id, visibility: "Public" });
        seats.push({ character, seat, user });
      }
      return { campaign, seats };
    });
  } finally {
    client.release();
  }
}

/** Who owns `characterIds` now, and the seat each is linked to. */
async function holdersOf(characterIds: string[]) {
  const holders = [];
  for (const characterId of characterIds) {
    const character = await Characters.findOne(db, { id: characterId }, Visibility.All);
    const link = await PlayerCharacters.findOne(db, { characterId });
    holders.push({ ownerId: character?.userId, seatId: link?.playerId });
  }
  return holders;
}

/**
 * Runs `calls` at once, each on a connection of its own, queued in their order on the campaign's row, which another
 * connection holds until the last of them waits, as two deletions that reach it together take turns on it. Answers
 * once every one is done, and what each answered or threw.
 */
async function runQueued(campaignId: string, ...calls: (() => Promise<unknown>)[]) {
  const holder = await pool.connect();
  const clients: PoolClient[] = [];
  const running: Promise<unknown>[] = [];
  try {
    await holder.query("BEGIN");
    await Locks.lockCampaigns(createTestDbFromClient(holder), { ids: [campaignId] }, "no key update");
    for (const call of calls) {
      const client = await pool.connect();
      clients.push(client);
      const pid = (await client.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0].pid;
      running.push(runOnConnection(client, call).catch((error: Error) => error));
      expect(await waitUntilWaiting(holder, pid)).toBe(true);
    }
    await holder.query("ROLLBACK");
    return await Promise.all(running);
  } finally {
    await holder.query("ROLLBACK");
    await Promise.all(running);
    holder.release();
    for (const client of clients) client.release();
  }
}

afterAll(async () => {
  const client = await pool.connect();
  try {
    for (const id of committedCampaigns) await Campaigns.delete(createTestDbFromClient(client), { id });
  } finally {
    client.release();
  }
  await users.deleteAll();
  await pool.end();
});

test("a character's creation that waits for its owner's account's deletion is refused, and makes no character", async () => {
  const user = await users.commit("deleted");
  expect(users.runDuringDeletion(user.id, () => createCharacterAs(makeSession(user.id)))).rejects.toEqual(
    new UnauthorizedError("Invalid session"),
  );
  expect(await Characters.count(db, { userId: user.id, visibility: Visibility.All })).toBe(0);
});

test("a fork that waits for its owner's account's deletion is refused, and makes no ruleset", async () => {
  const user = await users.commit("deleted");
  const { rulesetId } = await getSeedCtx();
  const name = `Refused ${uniqueId()}`;
  const fork = () => RulesetsService.forkRuleset(makeSession(user.id), rulesetId, { name, private: true });
  expect(users.runDuringDeletion(user.id, fork)).rejects.toEqual(new UnauthorizedError("Invalid session"));
  expect(await Rulesets.findOne(db, { name })).toBeUndefined();
});

test("an invite that waits for its invitee's account's deletion invites the address alone, which no account has", async () => {
  const { user: owner, session: ownerSession } = await createTestUser("owner");
  const ruleset = await createTestRuleset(owner.id);
  const character = await createCharacterAs(ownerSession);
  const invitee = await users.commit("deleted");
  const characterInvitee = await users.commit("deleted");

  const email = invitee.emailAddress;
  await users.runDuringDeletion(invitee.id, () =>
    ContributorsService.inviteContributor(ownerSession, ruleset.id, email, "Editor"),
  );
  expect((await Contributors.findOne(db, { rulesetId: ruleset.id, email, status: "Pending" }))?.userId).toBeNull();

  const characterEmail = characterInvitee.emailAddress;
  await users.runDuringDeletion(characterInvitee.id, () =>
    CharacterContributorsService.inviteContributor(ownerSession, character.id, characterEmail),
  );
  expect(
    (await CharacterContributors.findOne(db, { characterId: character.id, email: characterEmail, status: "Pending" }))
      ?.userId,
  ).toBeNull();
});

test("an invite to a seat that waits for its invitee's account's deletion invites the address alone", async () => {
  const { user: owner, session: ownerSession } = await createTestUser("owner");
  const { campaign } = await createTestCampaign(owner.id);
  const invitee = await users.commit("deleted");

  const added = await users.runDuringDeletion(invitee.id, () =>
    CampaignPlayersService.addPlayer(ownerSession, campaign.id, "Player Character", invitee.emailAddress),
  );

  expect(added).toMatchObject({ invite: { email: invitee.emailAddress, userId: null } });
});

test("an acceptance that waits for its invitee's account's deletion is refused, and turns nothing back", async () => {
  const { rulesetId } = await getSeedCtx();
  const { id: characterId } = await findSeededCharacter("Fenn Ashwalker");
  const [invitee, characterInvitee] = [await users.commit("deleted"), await users.commit("deleted")];
  const pending = { invitedBy: SEED_USER_ID, status: "Pending" } as const;
  // Committed, as an invite is by its answer: the test's own row would hold its account's key, which the deletion needs
  const client = await pool.connect();
  const [[invite], [characterInvite]] = await (async () => {
    try {
      const committedDb = createTestDbFromClient(client);
      const email = invitee.emailAddress;
      const ruleset = await Contributors.create(committedDb, { ...pending, email, rulesetId, userId: invitee.id });
      const character = await CharacterContributors.create(committedDb, {
        ...pending,
        characterId,
        email: characterInvitee.emailAddress,
        userId: characterInvitee.id,
      });
      return [ruleset, character] as const;
    } finally {
      client.release();
    }
  })();

  const accepted = users.runDuringDeletion(invitee.id, () =>
    ContributorsService.acceptInvite(makeSession(invitee.id), invite.id),
  );
  expect(accepted).rejects.toEqual(new UnauthorizedError("Invalid session"));
  const characterAccepted = users.runDuringDeletion(characterInvitee.id, () =>
    CharacterContributorsService.acceptInvite(makeSession(characterInvitee.id), characterInvite.id),
  );
  expect(characterAccepted).rejects.toEqual(new UnauthorizedError("Invalid session"));
  expect((await Contributors.findOne(db, { id: invite.id }))?.status).toBe("Pending");
  expect((await CharacterContributors.findOne(db, { id: characterInvite.id }))?.status).toBe("Pending");
});

test("an account's deletion revokes its invites to contribute and its contributions, none keeping its address", async () => {
  const { user, session } = await createTestUser();
  const { user: owner, session: ownerSession } = await createTestUser("owner");
  const ruleset = await createTestRuleset(owner.id);
  const joined = await createTestRuleset(owner.id);
  const declined = await createTestRuleset(owner.id);
  const character = await createCharacterAs(ownerSession);
  const email = user.emailAddress;
  const invite = await ContributorsService.inviteContributor(ownerSession, ruleset.id, email, "Editor");
  const characterInvite = await CharacterContributorsService.inviteContributor(ownerSession, character.id, email);
  const contribution = await ContributorsService.inviteContributor(ownerSession, joined.id, email, "Editor");
  await ContributorsService.acceptInvite(session, contribution.id);
  const rejected = await ContributorsService.inviteContributor(ownerSession, declined.id, email, "Editor");
  await ContributorsService.rejectInvite(session, rejected.id);

  await AccountService.deleteAccount(session, "password1234");

  const ended = { email: toDeletedAddress(user.id), status: "Revoked", userId: user.id };
  expect(await Contributors.findOne(db, { id: invite.id })).toMatchObject(ended);
  expect(await CharacterContributors.findOne(db, { id: characterInvite.id })).toMatchObject(ended);
  expect(await Contributors.findOne(db, { id: contribution.id })).toMatchObject(ended);
  expect(await Contributors.findOne(db, { id: rejected.id })).toMatchObject({ ...ended, status: "Rejected" });
});

test("an account's deletion ends the invites its address has that no sign-in claimed, none keeping the address", async () => {
  const { user: owner, session: ownerSession } = await createTestUser("owner");
  const ruleset = await createTestRuleset(owner.id);
  const { campaign } = await createTestCampaign(owner.id);
  const email = `unclaimed-${uniqueId()}@example.com`;
  const invite = await ContributorsService.inviteContributor(ownerSession, ruleset.id, email, "Editor");
  const seat = await CampaignPlayersService.addPlayer(ownerSession, campaign.id, "Player Character", email);
  const { user, session } = await createTestUser();
  await Users.update(db, { emailAddress: email }, { id: user.id });

  await AccountService.deleteAccount(session, "password1234");

  const placeholder = toDeletedAddress(user.id);
  expect(await Contributors.findOne(db, { id: invite.id })).toMatchObject({
    email: placeholder,
    status: "Revoked",
    userId: null,
  });
  expect(await Invites.findOne(db, { id: seat.invite!.id })).toBeUndefined();
  const [archived] = await db.select().from(invitesInCampaign).where(eq(invitesInCampaign.id, seat.invite!.id));
  expect(archived).toMatchObject({ deletedAt: expect.any(String), email: placeholder, userId: null });
});

describe("two accounts of one campaign, deleted at once", () => {
  test("two players' characters both go to their Game Master", async () => {
    const {
      seats: [master, first, second],
    } = await commitParty("Game Master", "Player Character", "Player Character");

    const answers = await runQueued(master.seat.campaignId, deletion(first.user.id), deletion(second.user.id));

    expect(answers).toEqual([{ success: true }, { success: true }]);
    const held = { ownerId: master.user.id, seatId: master.seat.id };
    expect(await holdersOf([first.character.id, second.character.id])).toEqual([held, held]);
    expect(await Players.findMany(db, { campaignId: master.seat.campaignId })).toMatchObject([{ id: master.seat.id }]);
  });

  test.each([
    ["the Game Master first", 0, 1],
    ["the player first", 1, 0],
  ] as const)("a Game Master and a player, %s: the one left runs it, with all they held", async (_, first, second) => {
    const { campaign, seats } = await commitParty("Game Master", "Player Character", "Player Character");
    const [left] = seats.slice(-1);

    const answers = await runQueued(campaign.id, deletion(seats[first].user.id), deletion(seats[second].user.id));

    expect(answers).toEqual([{ success: true }, { success: true }]);
    expect(await Players.findMany(db, { campaignId: campaign.id })).toMatchObject([
      { id: left.seat.id, role: "Game Master" },
    ]);
    const held = { ownerId: left.user.id, seatId: left.seat.id };
    expect(await holdersOf(seats.map(({ character }) => character.id))).toEqual([held, held, held]);
  });

  test("a Game Master and the one player left: the campaign is archived, and every character goes", async () => {
    const { campaign, seats } = await commitParty("Game Master", "Player Character");

    await runQueued(campaign.id, deletion(seats[0].user.id), deletion(seats[1].user.id));

    expect(await Campaigns.findOne(db, { id: campaign.id }, Visibility.ArchivedOnly)).toMatchObject({
      id: campaign.id,
    });
    const ids = seats.map(({ character }) => character.id);
    expect(await Characters.findMany(db, { ids }, Visibility.All)).toEqual([]);
  });

  test("two Game Masters, with nobody else: the campaign is archived, and every character goes", async () => {
    const { campaign, seats } = await commitParty("Game Master", "Game Master");

    await runQueued(campaign.id, deletion(seats[0].user.id), deletion(seats[1].user.id));

    expect(await Campaigns.findOne(db, { id: campaign.id }, Visibility.ArchivedOnly)).toMatchObject({
      id: campaign.id,
    });
    const ids = seats.map(({ character }) => character.id);
    expect(await Characters.findMany(db, { ids }, Visibility.All)).toEqual([]);
  });

  test("a deletion's character lock, past its wait on the campaign, holds what the one before it handed it", async () => {
    const { campaign, seats } = await commitParty("Game Master", "Player Character", "Player Character");
    const [master, heir] = seats;
    const client = await pool.connect();
    try {
      // A read that skips what's locked: it finds the row unless the deletion holds it
      const isFree = () =>
        Locks.lockRow(
          createTestDbFromClient(client),
          charactersInCharacter,
          master.character.id,
          "no key update",
          true,
        );
      let freeUnderTheLock: boolean | undefined;

      await runQueued(campaign.id, deletion(master.user.id), () =>
        withAccountDeletion([heir.user.id], async () => void (freeUnderTheLock = await isFree())),
      );

      expect(await Characters.findOne(db, { id: master.character.id })).toMatchObject({ userId: heir.user.id });
      expect(freeUnderTheLock).toBe(false);
      expect(await isFree()).toBe(true);
    } finally {
      client.release();
    }
  });
});
