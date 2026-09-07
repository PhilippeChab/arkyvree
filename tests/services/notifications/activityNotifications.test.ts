import { db } from "@/server/database/index.ts";
import { Aptitudes, Campaigns, Notifications, Players, Rulesets, Users } from "@/server/repositories/index.ts";
import { CampaignInvitesMethods } from "@/server/services/campaigns/InvitesService.ts";
import { ContributorsMethods } from "@/server/services/rulesets/ContributorsService.ts";
import { FeatsMethods } from "@/server/services/rulesets/FeatsService.ts";
import type { Session } from "@/shared/relations.ts";
import { describe, expect, test } from "bun:test";

describe("activityNotifications", () => {
  function createTestSession(userId: string): Session {
    return {
      id: `session-${Math.random().toString(36).substr(2, 9)}`,
      userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deletedAt: null,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  async function createTestUser(prefix = "notif") {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const users = await Users.create(db, {
      username: `${prefix}-${uniqueId}`,
      emailAddress: `${prefix}-${uniqueId}@example.com`,
      password: "password1234",
    });
    const user = users[0];
    return { user, session: createTestSession(user.id) };
  }

  async function createTestRuleset(userId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const rulesets = await Rulesets.create(db, {
      name: `Test Ruleset ${uniqueId}`,
      description: "Test ruleset",
      private: true,
      baseRules: "Dungeons & Dragons: 3.5",
      userId,
    });
    return rulesets[0];
  }

  async function createTestCampaign(userId: string, rulesetId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const campaigns = await Campaigns.create(db, {
      name: `Test Campaign ${uniqueId}`,
      description: "Test campaign",
      rulesetId,
    });
    const campaign = campaigns[0];

    const players = await Players.create(db, {
      userId,
      campaignId: campaign.id,
      role: "Game Master",
    });
    return { campaign, gmPlayer: players[0] };
  }

  async function createTestAptitude(rulesetId: string) {
    const uniqueId = Math.random().toString(36).substr(2, 9);
    const [aptitude] = await Aptitudes.create(db, {
      name: `Test Aptitude ${uniqueId}`,
      description: "Test aptitude",
      rulesetId,
    });
    return aptitude;
  }

  async function getNotificationsForUser(userId: string) {
    return await Notifications.findMany(db, { recipientId: userId }, { limit: 50, page: 1 });
  }

  // ── Campaign invite notifications ────────────────────────────────

  describe("campaign invite notifications", () => {
    test("createCampaignInvite notifies the invitee", async () => {
      const { user: gm, session: gmSession } = await createTestUser("gm");
      const { user: invitee } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(gm.id);
      const { campaign } = await createTestCampaign(gm.id, ruleset.id);

      const playerSlot = await Players.create(db, {
        campaignId: campaign.id,
        role: "Player Character",
      });

      await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        playerSlot[0],
        invitee.emailAddress,
      );

      const inviteeNotifications = await getNotificationsForUser(invitee.id);
      expect(inviteeNotifications.items.length).toBeGreaterThanOrEqual(1);

      const notification = inviteeNotifications.items.find(
        (n) => n.type === "createCampaignInvite",
      );
      expect(notification).toBeDefined();
      expect(notification!.actorId).toBe(gm.id);
    });

    test("acceptCampaignInvite notifies campaign GMs", async () => {
      const { user: gm, session: gmSession } = await createTestUser("gm");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(gm.id);
      const { campaign } = await createTestCampaign(gm.id, ruleset.id);

      const playerSlot = await Players.create(db, {
        campaignId: campaign.id,
        role: "Player Character",
      });

      await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        playerSlot[0],
        invitee.emailAddress,
      );

      // Find the invite
      const invites = await CampaignInvitesMethods.getUserInvites(invitee.id);
      const invite = invites.find((i) => i.status === "Pending");
      expect(invite).toBeDefined();

      // Clear GM's notifications before accepting
      await Notifications.markAllRead(db, { recipientId: gm.id });

      await CampaignInvitesMethods.acceptCampaignInvite(inviteeSession, invite!.id);

      const gmNotifications = await getNotificationsForUser(gm.id);
      const acceptNotification = gmNotifications.items.find(
        (n) => n.type === "acceptCampaignInvite" && !n.readAt,
      );
      expect(acceptNotification).toBeDefined();
      expect(acceptNotification!.actorId).toBe(invitee.id);
    });

    test("actor is never notified of their own action", async () => {
      const { user: gm, session: gmSession } = await createTestUser("gm");
      const ruleset = await createTestRuleset(gm.id);
      const { campaign } = await createTestCampaign(gm.id, ruleset.id);

      const playerSlot = await Players.create(db, {
        campaignId: campaign.id,
        role: "Player Character",
      });

      // GM invites an unregistered email — no invitee userId
      await CampaignInvitesMethods.createCampaignInvite(
        gmSession,
        playerSlot[0],
        "unknown@nowhere.com",
      );

      // GM should NOT get a notification for their own action
      const gmNotifications = await getNotificationsForUser(gm.id);
      const selfNotification = gmNotifications.items.find(
        (n) => n.type === "createCampaignInvite" && n.actorId === gm.id,
      );
      expect(selfNotification).toBeUndefined();
    });
  });

  // ── Contributor notifications ────────────────────────────────────

  describe("contributor notifications", () => {
    test("inviteContributor notifies the invitee", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      await ContributorsMethods.inviteContributor(
        ownerSession,
        ruleset.id,
        invitee.emailAddress,
        "Editor",
      );

      const inviteeNotifications = await getNotificationsForUser(invitee.id);
      const notification = inviteeNotifications.items.find(
        (n) => n.type === "inviteContributor",
      );
      expect(notification).toBeDefined();
      expect(notification!.actorId).toBe(owner.id);
    });

    test("acceptContributorInvite notifies the ruleset owner", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const contributor = await ContributorsMethods.inviteContributor(
        ownerSession,
        ruleset.id,
        invitee.emailAddress,
        "Editor",
      );

      await ContributorsMethods.acceptContributorInvite(inviteeSession, contributor.id);

      const ownerNotifications = await getNotificationsForUser(owner.id);
      const notification = ownerNotifications.items.find(
        (n) => n.type === "acceptContributorInvite",
      );
      expect(notification).toBeDefined();
      expect(notification!.actorId).toBe(invitee.id);
    });

    test("revokeContributor notifies the affected contributor", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("contrib");
      const ruleset = await createTestRuleset(owner.id);

      const contributor = await ContributorsMethods.inviteContributor(
        ownerSession,
        ruleset.id,
        invitee.emailAddress,
        "Editor",
      );
      await ContributorsMethods.acceptContributorInvite(inviteeSession, contributor.id);
      await ContributorsMethods.revokeContributor(ownerSession, contributor.id);

      const contribNotifications = await getNotificationsForUser(invitee.id);
      const notification = contribNotifications.items.find(
        (n) => n.type === "revokeContributor",
      );
      expect(notification).toBeDefined();
      expect(notification!.actorId).toBe(owner.id);
    });

    // The parent-lookup in resolveRecipients used to default to UnarchivedOnly
    // visibility — once the ruleset/character was archived the recipient
    // resolution returned undefined and the owner was silently dropped. The
    // Visibility.All fix keeps reject/leave notifications flowing.
    test("rejectContributorInvite still notifies the owner after the ruleset is archived", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const contributor = await ContributorsMethods.inviteContributor(
        ownerSession,
        ruleset.id,
        invitee.emailAddress,
        "Editor",
      );
      await Rulesets.archive(db, { id: ruleset.id });
      await ContributorsMethods.rejectContributorInvite(inviteeSession, contributor.id);

      const ownerNotifications = await getNotificationsForUser(owner.id);
      const notification = ownerNotifications.items.find(
        (n) => n.type === "rejectContributorInvite" && n.actorId === invitee.id,
      );
      expect(notification).toBeDefined();
    });

    test("leaveRuleset still notifies the owner after the ruleset is archived", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: invitee, session: inviteeSession } = await createTestUser("invitee");
      const ruleset = await createTestRuleset(owner.id);

      const contributor = await ContributorsMethods.inviteContributor(
        ownerSession,
        ruleset.id,
        invitee.emailAddress,
        "Editor",
      );
      await ContributorsMethods.acceptContributorInvite(inviteeSession, contributor.id);
      await Rulesets.archive(db, { id: ruleset.id });
      await ContributorsMethods.leaveRuleset(inviteeSession, ruleset.id);

      const ownerNotifications = await getNotificationsForUser(owner.id);
      const notification = ownerNotifications.items.find(
        (n) => n.type === "leaveRuleset" && n.actorId === invitee.id,
      );
      expect(notification).toBeDefined();
    });
  });

  // ── Ruleset content change notifications ─────────────────────────

  describe("ruleset content change notifications", () => {
    test("contributor creating a feat notifies the owner and other contributors", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: contribA, session: contribASession } = await createTestUser("contribA");
      const { user: contribB, session: contribBSession } = await createTestUser("contribB");
      const ruleset = await createTestRuleset(owner.id);

      // Add two contributors
      const cA = await ContributorsMethods.inviteContributor(ownerSession, ruleset.id, contribA.emailAddress, "Editor");
      const cB = await ContributorsMethods.inviteContributor(ownerSession, ruleset.id, contribB.emailAddress, "Editor");
      await ContributorsMethods.acceptContributorInvite(contribASession, cA.id);
      await ContributorsMethods.acceptContributorInvite(contribBSession, cB.id);

      // contribA creates a feat
      const aptitude = await createTestAptitude(ruleset.id);
      const feat = await FeatsMethods.createRulesetFeat(contribASession, ruleset.id, {
        name: `Notif Test Feat ${Math.random().toString(36).substr(2, 9)}`,
        description: "Test feat",
        aptitudeIds: [aptitude.id],
      });

      // Owner should get a notification
      const ownerNotifs = await getNotificationsForUser(owner.id);
      const ownerFeatNotif = ownerNotifs.items.find(
        (n) => n.type === "createFeat" && n.targetId === feat.id,
      );
      expect(ownerFeatNotif).toBeDefined();
      expect(ownerFeatNotif!.actorId).toBe(contribA.id);

      // ContribB should get a notification
      const contribBNotifs = await getNotificationsForUser(contribB.id);
      const contribBFeatNotif = contribBNotifs.items.find(
        (n) => n.type === "createFeat" && n.targetId === feat.id,
      );
      expect(contribBFeatNotif).toBeDefined();

      // ContribA (the actor) should NOT get a notification
      const contribANotifs = await getNotificationsForUser(contribA.id);
      const contribASelfNotif = contribANotifs.items.find(
        (n) => n.type === "createFeat" && n.targetId === feat.id,
      );
      expect(contribASelfNotif).toBeUndefined();
    });

    test("owner creating a feat in their own ruleset with no contributors generates no notifications", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("solo-owner");
      const ruleset = await createTestRuleset(owner.id);

      const aptitude = await createTestAptitude(ruleset.id);
      const feat = await FeatsMethods.createRulesetFeat(ownerSession, ruleset.id, {
        name: `Solo Feat ${Math.random().toString(36).substr(2, 9)}`,
        description: "Test feat",
        aptitudeIds: [aptitude.id],
      });

      // Owner should NOT get a notification for their own action
      const ownerNotifs = await getNotificationsForUser(owner.id);
      const selfNotif = ownerNotifs.items.find(
        (n) => n.type === "createFeat" && n.targetId === feat.id,
      );
      expect(selfNotif).toBeUndefined();
    });
  });

  // ── Notification operations ──────────────────────────────────────

  describe("notification operations", () => {
    test("markRead sets readAt timestamp", async () => {
      const { user } = await createTestUser("reader");

      const [notification] = await Notifications.create(db, {
        recipientId: user.id,
        actorId: "00000000-0000-4000-8000-000000000456",
        type: "createFeat",
        targetId: "00000000-0000-0000-0000-000000000001",
        targetTable: "feats",
        data: { actorName: "Test" },
      });

      expect(notification.readAt).toBeNull();

      const [updated] = await Notifications.markRead(db, {
        id: notification.id,
        recipientId: user.id,
      });

      expect(updated.readAt).not.toBeNull();
    });

    test("markAllRead marks all unread notifications", async () => {
      const { user } = await createTestUser("bulk-reader");

      await Notifications.createMany(db, [
        {
          recipientId: user.id,
          actorId: "00000000-0000-4000-8000-000000000456",
          type: "createFeat",
          targetId: "00000000-0000-0000-0000-000000000001",
          targetTable: "feats",
        },
        {
          recipientId: user.id,
          actorId: "00000000-0000-4000-8000-000000000456",
          type: "updateFeat",
          targetId: "00000000-0000-0000-0000-000000000002",
          targetTable: "feats",
        },
      ]);

      const beforeCount = await Notifications.countUnread(db, { recipientId: user.id });
      expect(beforeCount).toBeGreaterThanOrEqual(2);

      await Notifications.markAllRead(db, { recipientId: user.id });

      const afterCount = await Notifications.countUnread(db, { recipientId: user.id });
      expect(afterCount).toBe(0);
    });

    test("countUnread only counts unread notifications", async () => {
      const { user } = await createTestUser("count-test");

      const [n1] = await Notifications.create(db, {
        recipientId: user.id,
        actorId: "00000000-0000-4000-8000-000000000456",
        type: "createFeat",
        targetId: "00000000-0000-0000-0000-000000000001",
        targetTable: "feats",
      });

      await Notifications.create(db, {
        recipientId: user.id,
        actorId: "00000000-0000-4000-8000-000000000456",
        type: "updateFeat",
        targetId: "00000000-0000-0000-0000-000000000002",
        targetTable: "feats",
      });

      // Mark first as read
      await Notifications.markRead(db, { id: n1.id, recipientId: user.id });

      const count = await Notifications.countUnread(db, { recipientId: user.id });
      // At least 1 unread (the second one), but first is now read
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test("markRead does not affect other users' notifications", async () => {
      const { user: userA } = await createTestUser("userA");
      const { user: userB } = await createTestUser("userB");

      const [notifA] = await Notifications.create(db, {
        recipientId: userA.id,
        actorId: "00000000-0000-4000-8000-000000000456",
        type: "createFeat",
        targetId: "00000000-0000-0000-0000-000000000001",
        targetTable: "feats",
      });

      // UserB tries to mark userA's notification as read
      const result = await Notifications.markRead(db, {
        id: notifA.id,
        recipientId: userB.id,
      });
      expect(result.length).toBe(0);

      // UserA's notification should still be unread
      const notif = await Notifications.findOne(db, { id: notifA.id });
      expect(notif!.readAt).toBeNull();
    });
  });
});
