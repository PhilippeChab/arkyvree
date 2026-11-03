import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { Campaigns, Characters, Notifications, Players, Rulesets } from "@/server/repositories/index.ts";
import { CampaignInvitesService } from "@/server/services/campaigns/invites/index.ts";
import { CampaignPlayersService } from "@/server/services/campaigns/players/index.ts";
import { CharacterContributorsService } from "@/server/services/characters/contributors/index.ts";
import { NotificationsService } from "@/server/services/notifications/index.ts";
import { ContributorsService } from "@/server/services/rulesets/contributors/index.ts";
import type { Session, User } from "@/shared/relations.ts";
import { createTestCampaign, inviteToSlot } from "@/tests/support/campaigns.ts";
import { measure } from "@/tests/support/database.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { createTestRuleset } from "@/tests/support/rulesets.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** An invite sent to its invitee, and what can become of it: its own page's read, and what makes it answered or not. */
interface SentInvite {
  accept(session: Session): Promise<unknown>;
  /** Archives the record it invites to. */
  archive(): Promise<unknown>;
  id: string;
  read(session: Session): Promise<{ acceptRefusal: string | null; canAccept: boolean; canReject: boolean }>;
  revoke(): Promise<unknown>;
}

/** Each kind of invite, by what it's to, and how it's sent to its invitee. */
function senders() {
  return [
    ["a campaign's", sendCampaignInvite],
    ["a character's", sendCharacterInvite],
    ["a ruleset's", sendRulesetInvite],
  ] as const;
}

/** What the invitee's notification of each invite carries, by its invite's id: on their page, and in the bell. */
async function notifiedAnswers(session: Session) {
  const page = await NotificationsService.getNotifications(session, {}, { limit: 100, page: 1 });
  const bell = await NotificationsService.getUnreadSummary(session, 100);
  const byInvite = (items: typeof page.items) => new Map(items.map((item) => [item.targetId, item.inviteAnswers]));
  return { bell: byInvite(bell.items), page: byInvite(page.items) };
}

/** What the invite's page answers of an invite: whether it may be accepted, why not, and whether it may be answered. */
async function pageAnswers(invite: SentInvite, session: Session) {
  const { acceptRefusal, canAccept, canReject } = await invite.read(session);
  return { acceptRefusal, canAccept, canReject };
}

/** A campaign invite to `invitee`, into a new Game Master's empty slot. */
async function sendCampaignInvite(invitee: User) {
  const { user: gm, session: gmSession } = await createTestUser("gm");
  const { campaign } = await createTestCampaign(gm.id);
  const [slot] = await Players.create(db, { campaignId: campaign.id, role: "Player Character" });
  const invite = await inviteToSlot(gmSession, slot, invitee.emailAddress);
  return {
    accept: (session) => CampaignInvitesService.acceptInvite(session, invite.id),
    archive: () => Campaigns.archive(db, { id: campaign.id }),
    id: invite.id,
    read: (session) => CampaignInvitesService.getInvite(session, invite.id),
    removeSlot: () => CampaignPlayersService.removePlayer(gmSession, campaign.id, slot.id),
    revoke: () => CampaignInvitesService.revokeInvite(gmSession, invite.id),
  } satisfies SentInvite & { removeSlot(): Promise<unknown> };
}

/** An invite to `invitee` to contribute to a new user's character. */
async function sendCharacterInvite(invitee: User): Promise<SentInvite> {
  const { user: owner, session: ownerSession } = await createTestUser("owner");
  const character = await createTestCharacter(owner.id);
  const invite = await CharacterContributorsService.inviteContributor(ownerSession, character.id, invitee.emailAddress);
  return {
    accept: (session) => CharacterContributorsService.acceptInvite(session, invite.id),
    archive: () => Characters.archive(db, { id: character.id }),
    id: invite.id,
    read: (session) => CharacterContributorsService.getInvite(session, invite.id),
    revoke: () => CharacterContributorsService.revokeContributor(ownerSession, character.id, invite.id),
  };
}

/** An invite to `invitee` to contribute to a new user's ruleset, as an Editor. */
async function sendRulesetInvite(invitee: User): Promise<SentInvite> {
  const { user: owner, session: ownerSession } = await createTestUser("owner");
  const ruleset = await createTestRuleset(owner.id);
  const invite = await ContributorsService.inviteContributor(ownerSession, ruleset.id, invitee.emailAddress, "Editor");
  return {
    accept: (session) => ContributorsService.acceptInvite(session, invite.id),
    archive: () => Rulesets.archive(db, { id: ruleset.id }),
    id: invite.id,
    read: (session) => ContributorsService.getInvite(session, invite.id),
    revoke: () => ContributorsService.revokeContributor(ownerSession, ruleset.id, invite.id),
  };
}

describe("NotificationsService", () => {
  describe("an invite's notification", () => {
    for (const [kind, send] of senders()) {
      test(`answers ${kind} invite as its own page does: pending, read, revoked, to an archived record, accepted`, async () => {
        const { user: invitee, session } = await createTestUser("invitee");
        const pending = await send(invitee);
        const read = await send(invitee);
        const revoked = await send(invitee);
        const archived = await send(invitee);
        const accepted = await send(invitee);

        const [readNotification] = (
          await NotificationsService.getNotifications(session, {}, { limit: 100, page: 1 })
        ).items.filter((item) => item.targetId === read.id);
        await NotificationsService.markRead(session, readNotification.id);
        await revoked.revoke();
        await archived.archive();
        await accepted.accept(session);

        const { bell, page } = await notifiedAnswers(session);
        for (const invite of [pending, read, revoked, archived, accepted])
          expect(page.get(invite.id)).toEqual(await pageAnswers(invite, session));
        expect([pending, read, revoked, archived, accepted].map((invite) => page.get(invite.id))).toEqual([
          { acceptRefusal: null, canAccept: true, canReject: true },
          // Read, it's still pending: its notification still offers it
          { acceptRefusal: null, canAccept: true, canReject: true },
          { acceptRefusal: "Invite is no longer pending", canAccept: false, canReject: false },
          // Its Reject alone, which clears it
          { acceptRefusal: expect.stringMatching(/ is archived$/), canAccept: false, canReject: true },
          { acceptRefusal: "Invite is no longer pending", canAccept: false, canReject: false },
        ]);
        // The bell lists the unread ones, as the page answers them: answering an invite reads its notification
        expect(new Map([...page].filter(([id]) => id !== read.id && id !== accepted.id))).toEqual(bell);
      });
    }

    test("answers an invite gone with its slot as one that can't be answered", async () => {
      const { user: invitee, session } = await createTestUser("invitee");
      const invite = await sendCampaignInvite(invitee);
      await invite.removeSlot();

      const { bell, page } = await notifiedAnswers(session);
      expect(page.get(invite.id)).toEqual({ acceptRefusal: null, canAccept: false, canReject: false });
      expect(bell.get(invite.id)).toEqual(page.get(invite.id));
    });

    test("is the only notification that carries answers", async () => {
      const { user: invitee, session } = await createTestUser("invitee");
      const { user: gm, session: gmSession } = await createTestUser("gm");
      const { campaign } = await createTestCampaign(gm.id);
      const [slot] = await Players.create(db, { campaignId: campaign.id, role: "Player Character" });
      await CampaignInvitesService.acceptInvite(
        session,
        (await inviteToSlot(gmSession, slot, invitee.emailAddress)).id,
      );

      const { items } = await NotificationsService.getNotifications(gmSession, {}, { limit: 100, page: 1 });
      expect(items.map(({ inviteAnswers, type }) => ({ inviteAnswers, type }))).toEqual([
        { inviteAnswers: null, type: "acceptCampaignInvite" },
      ]);
    });

    test("reads a page's invites in as many queries, whatever their number", async () => {
      const cost = async (invites: number) => {
        const { user: invitee, session } = await createTestUser("invitee");
        for (let i = 0; i < invites; i++) for (const [, send] of senders()) await send(invitee);
        const page = await measure(() => NotificationsService.getNotifications(session, {}, { limit: 100, page: 1 }));
        const bell = await measure(() => NotificationsService.getUnreadSummary(session));
        expect(page.result.items).toHaveLength(invites * senders().length);
        return [page.timing.queryCount, bell.timing.queryCount];
      };
      expect(await cost(3)).toEqual(await cost(1));
    });

    test("reads none of the answers for a reader that has no place for them, in the page's own queries", async () => {
      const { user: invitee, session } = await createTestUser("invitee");
      for (const [, send] of senders()) await send(invitee);
      const pagination = { limit: 100, page: 1 };

      const plain = await measure(() => NotificationsService.getNotifications(session, {}, pagination, false));
      const page = await measure(() => Notifications.findPage(db, { recipientId: invitee.id }, pagination));
      expect(plain.timing.queryCount).toBe(page.timing.queryCount);
      expect(plain.result.items).toEqual(page.result.items.map((item) => ({ ...item, inviteAnswers: null })));
    });
  });

  describe("markAllRead", () => {
    test("reads an invite's notification once its invite can't be answered, never one it still can be", async () => {
      const { user: invitee, session } = await createTestUser("invitee");
      const answerable: string[] = [];
      for (const [, send] of senders()) {
        const pending = await send(invitee);
        const archived = await send(invitee);
        await archived.archive();
        await (await send(invitee)).revoke();
        // Rejecting an invite to an archived record still clears it
        answerable.push(pending.id, archived.id);
      }
      await (await sendCampaignInvite(invitee)).removeSlot();

      expect((await NotificationsService.getUnreadSummary(session, 100)).count).toBe(10);
      await NotificationsService.markAllRead(session);
      const { count, items } = await NotificationsService.getUnreadSummary(session, 100);
      expect(items.map(({ targetId }) => targetId).sort()).toEqual(answerable.sort());
      expect(count).toBe(answerable.length);
    });
  });
});
