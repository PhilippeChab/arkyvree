import { describe, expect, test } from "bun:test";

import { db } from "@/server/database/index.ts";
import { ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Campaigns, Players, Rulesets } from "@/server/repositories/index.ts";
import { CampaignsService } from "@/server/services/campaigns/index.ts";
import type { Session } from "@/shared/relations.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

const firstPage = { limit: 10, page: 1 };

async function createCampaign(session: Session, name = "Test Campaign", description = "Test description") {
  const { rulesetId } = await getSeedCtx();
  return (await CampaignsService.createCampaign(session, { name, description, rulesetId })).campaign;
}

/** A new user playing a character in the campaign. */
async function addPlayer(campaignId: string) {
  const { user, session } = await createTestUser("player");
  await Players.create(db, { userId: user.id, campaignId, role: "Player Character" });
  return session;
}

/** A Game Master's campaign, a player in it and a stranger to it. */
async function setup() {
  const { session: gm } = await createTestUser("gm");
  const campaign = await createCampaign(gm);
  const { session: stranger } = await createTestUser("stranger");
  return { gm, campaign, player: await addPlayer(campaign.id), stranger };
}

describe("CampaignsService", () => {
  describe("createCampaign", () => {
    test("creates a campaign with its creator as Game Master", async () => {
      const { rulesetId } = await getSeedCtx();
      const { user, session } = await createTestUser();
      const result = await CampaignsService.createCampaign(session, {
        name: "New Campaign",
        description: "",
        rulesetId,
      });
      expect(result.campaign).toMatchObject({ name: "New Campaign", description: "", rulesetId });
      expect(result.player).toMatchObject({ userId: user.id, campaignId: result.campaign.id, role: "Game Master" });
    });

    test("no longer caps how many campaigns a user runs", async () => {
      const { session } = await createTestUser();
      const [first] = [await createCampaign(session), await createCampaign(session), await createCampaign(session)];
      await CampaignsService.archiveCampaign(session, first.id);
      await CampaignsService.unarchiveCampaign(session, first.id);
      expect(await Campaigns.count(db, { userId: session.userId })).toBe(3);
    });

    test("needs access to the ruleset, which a campaign on it gives its members", async () => {
      const { user: owner, session: ownerSession } = await createTestUser("owner");
      const { user: outsider, session } = await createTestUser("outsider");
      const ruleset = await createSeededTestRuleset(owner.id);

      await expect(
        CampaignsService.createCampaign(session, { name: "Unauthorized", rulesetId: ruleset.id }),
      ).rejects.toThrow(ForbiddenError);
      expect(await Campaigns.count(db, { userId: outsider.id })).toBe(0);

      const { campaign } = await CampaignsService.createCampaign(ownerSession, {
        name: "Authorized",
        rulesetId: ruleset.id,
      });
      await Players.create(db, { campaignId: campaign.id, userId: outsider.id, role: "Player Character" });
      expect(
        (await CampaignsService.createCampaign(session, { name: "Existing access", rulesetId: ruleset.id })).campaign
          .rulesetId,
      ).toBe(ruleset.id);
    });

    test("refuses archived rulesets and extensions", async () => {
      const { user, session } = await createTestUser();
      const archived = await createSeededTestRuleset(user.id, { status: "Archived" });
      await expect(
        CampaignsService.createCampaign(session, { name: "Archived", rulesetId: archived.id }),
      ).rejects.toThrow("active playable ruleset");
      const extension = await createSeededTestRuleset(user.id, { status: "Published" });
      await Rulesets.update(db, { kind: "extension" }, { id: extension.id });
      await expect(
        CampaignsService.createCampaign(session, { name: "Extension", rulesetId: extension.id }),
      ).rejects.toThrow("active playable ruleset");
    });
  });

  describe("getCampaigns", () => {
    test("lists the user's campaigns with their player count", async () => {
      const { session } = await createTestUser();
      expect(await CampaignsService.getCampaigns(session, {}, firstPage)).toMatchObject({
        items: [],
        page: 1,
        nextPage: undefined,
      });

      const campaign = await createCampaign(session);
      await addPlayer(campaign.id);
      await addPlayer(campaign.id);
      expect((await CampaignsService.getCampaigns(session, {}, firstPage)).items).toMatchObject([
        { id: campaign.id, name: campaign.name, currentPlayers: 3 },
      ]);
    });

    test("searches, pages and filters by archived state", async () => {
      const { session } = await createTestUser();
      const dragons = await createCampaign(session, "Dragon Quest");
      const goblins = await createCampaign(session, "Goblin Wars");
      const archived = await createCampaign(session, "Old Campaign");
      await CampaignsService.archiveCampaign(session, archived.id);
      const ids = async (where: Parameters<typeof CampaignsService.getCampaigns>[1], pagination = firstPage) =>
        (await CampaignsService.getCampaigns(session, where, pagination)).items.map((c) => c.id);

      expect(await ids({ search: "Dragon" })).toEqual([dragons.id]);
      expect((await ids({ visibility: "active" })).sort()).toEqual([dragons.id, goblins.id].sort());
      expect(await ids({ visibility: "archived" })).toEqual([archived.id]);
      expect(await CampaignsService.getCampaigns(session, { visibility: "all" }, { limit: 2, page: 1 })).toMatchObject({
        nextPage: 2,
      });
      expect(await ids({ visibility: "all" }, { limit: 2, page: 2 })).toHaveLength(1);
    });
  });

  describe("getCampaign", () => {
    test("returns the campaign with the user's role in it", async () => {
      const { session } = await createTestUser();
      const created = await createCampaign(session);
      expect(await CampaignsService.getCampaign(session, created.id)).toMatchObject({
        id: created.id,
        name: "Test Campaign",
        description: "Test description",
        currentUserRole: "Game Master",
      });
      await expect(CampaignsService.getCampaign(session, NIL_UUID)).rejects.toThrow(NotFoundError);
    });
  });

  describe("updateCampaign", () => {
    test("updates the name, and the description when given", async () => {
      const { gm, campaign } = await setup();
      expect(
        await CampaignsService.updateCampaign(gm, campaign.id, { name: "Renamed", description: "Updated" }),
      ).toMatchObject({ id: campaign.id, name: "Renamed", description: "Updated" });
      expect(await CampaignsService.updateCampaign(gm, campaign.id, { name: "Renamed Again" })).toMatchObject({
        name: "Renamed Again",
        description: "Updated",
      });
    });

    test("is for the Game Master only", async () => {
      const { campaign, player, stranger } = await setup();
      for (const session of [player, stranger]) {
        await expect(CampaignsService.updateCampaign(session, campaign.id, { name: "Hacked" })).rejects.toThrow(
          ForbiddenError,
        );
      }
      await expect(CampaignsService.updateCampaign(stranger, NIL_UUID, { name: "Missing" })).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("archiving", () => {
    test("archives a campaign, keeping its players, and unarchives it", async () => {
      const { gm, campaign } = await setup();
      const archived = await CampaignsService.archiveCampaign(gm, campaign.id);
      expect(archived.deletedAt).not.toBeNull();
      // Players stay: the campaign is gone from lists, but direct links still resolve membership.
      expect(await Players.findMany(db, { campaignId: campaign.id })).toHaveLength(2);

      expect((await CampaignsService.unarchiveCampaign(gm, campaign.id)).deletedAt).toBeNull();
      const active = await CampaignsService.getCampaigns(gm, { visibility: "active" }, firstPage);
      expect(active.items.map((c) => c.id)).toEqual([campaign.id]);
    });

    test("is for the Game Master only", async () => {
      const { gm, campaign, player, stranger } = await setup();
      for (const session of [player, stranger]) {
        await expect(CampaignsService.archiveCampaign(session, campaign.id)).rejects.toThrow(ForbiddenError);
      }
      await CampaignsService.archiveCampaign(gm, campaign.id);
      for (const session of [player, stranger]) {
        await expect(CampaignsService.unarchiveCampaign(session, campaign.id)).rejects.toThrow(ForbiddenError);
      }
      await expect(CampaignsService.archiveCampaign(gm, NIL_UUID)).rejects.toThrow(NotFoundError);
      await expect(CampaignsService.unarchiveCampaign(gm, NIL_UUID)).rejects.toThrow(NotFoundError);
    });
  });

  describe("hardDeleteCampaign", () => {
    test("deletes an archived campaign and its players for good", async () => {
      const { gm, campaign } = await setup();
      await CampaignsService.archiveCampaign(gm, campaign.id);
      await CampaignsService.hardDeleteCampaign(gm, campaign.id);
      expect(await Campaigns.findOne(db, { id: campaign.id }, Visibility.All)).toBeUndefined();
      expect(await Players.findMany(db, { campaignId: campaign.id })).toEqual([]);
    });

    test("refuses a campaign that isn't archived, and anyone but the Game Master", async () => {
      const { gm, campaign, player } = await setup();
      await expect(CampaignsService.hardDeleteCampaign(gm, campaign.id)).rejects.toThrow(NotFoundError);
      await CampaignsService.archiveCampaign(gm, campaign.id);
      await expect(CampaignsService.hardDeleteCampaign(player, campaign.id)).rejects.toThrow(ForbiddenError);
      expect(await Campaigns.findOne(db, { id: campaign.id }, Visibility.All)).toBeDefined();
    });
  });
});
