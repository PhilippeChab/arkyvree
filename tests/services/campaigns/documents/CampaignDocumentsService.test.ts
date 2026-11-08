import { describe, expect, test } from "bun:test";

import { documentsInCampaign } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  STALE_ENTITY_MESSAGE,
  UnprocessableEntityError,
} from "@/server/errors/index.ts";
import { Campaigns, Documents, Notifications, Players } from "@/server/repositories/index.ts";
import { ActivitiesService } from "@/server/services/activities/index.ts";
import { CampaignDocumentsService } from "@/server/services/campaigns/documents/index.ts";
import { CampaignsService } from "@/server/services/campaigns/index.ts";
import { CampaignPlayersService } from "@/server/services/campaigns/players/index.ts";
import { collectNotified } from "@/server/websockets/index.ts";
import { TARGET_TYPES } from "@/shared/activityTargets.ts";
import { MAX_CAMPAIGN_DOCUMENTS, MAX_DOCUMENT_DEPTH } from "@/shared/campaignDocuments.ts";
import type { Session } from "@/shared/relations.ts";
import { activityTypes } from "@/tests/support/activities.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { insertRows } from "@/tests/support/database.ts";
import { NIL_UUID } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

type NewDocument = Parameters<typeof CampaignDocumentsService.createDocument>[2];

/** A new item's parts: a Private document at the top, unless `parts` say otherwise. */
function newDocument(parts: Partial<NewDocument> = {}): NewDocument {
  return { kind: "Document", name: "Notes", parentId: null, readerIds: [], visibility: "Private", ...parts };
}

/** What a user was notified of: each notification's type and the name its data gives. */
async function inbox(userId: string) {
  const { items } = await Notifications.findPage(db, { recipientId: userId }, { limit: 50, page: 1 });
  return items.map(({ type, data }) => `${type} ${(data as { name?: string }).name}`);
}

/** The names of the campaign's items a session sees. */
async function namesSeen(session: Session, campaignId: string) {
  return (await CampaignDocumentsService.getDocuments(session, campaignId)).items.map(({ name }) => name).sort();
}

/** A user seated in a campaign as `role`. */
async function seat(campaignId: string, role: "Game Master" | "Player Character") {
  const { user, session } = await createTestUser();
  const [player] = await Players.create(db, { userId: user.id, campaignId, role });
  return { user, session, player };
}

/** A Game Master's campaign, with two players (the rogue's and the bard's seats) and a second Game Master. */
async function setup() {
  const { user, session: gm } = await createTestUser("gm");
  const { campaign } = await createTestCampaign(user.id);
  const rogue = await seat(campaign.id, "Player Character");
  const bard = await seat(campaign.id, "Player Character");
  const coGm = await seat(campaign.id, "Game Master");
  const add = (parts: Partial<NewDocument> = {}) =>
    CampaignDocumentsService.createDocument(gm, campaign.id, newDocument(parts));
  return { gm, campaign, rogue, bard, coGm, add };
}

describe("CampaignDocumentsService", () => {
  describe("createDocument", () => {
    test("adds a Private folder or document, by its Game Master, the author it records", async () => {
      const { gm, campaign, add } = await setup();
      const folder = await add({ kind: "Folder", name: "Act 1" });
      const document = await add({ name: "Map", parentId: folder.id, body: "The keep" });

      expect(folder).toMatchObject({ kind: "Folder", body: null, visibility: "Private", authorId: gm.userId });
      expect(document).toMatchObject({ kind: "Document", body: "The keep", parentId: folder.id, readerIds: [] });
      expect((await add({ name: "Blank" })).body).toBe("");
      expect(await activityTypes(gm.userId, TARGET_TYPES.campaignDocuments, folder.id)).toEqual([
        "createCampaignDocument",
      ]);
      expect((await CampaignDocumentsService.getDocument(gm, campaign.id, document.id)).path).toEqual([
        { id: folder.id, name: "Act 1" },
      ]);
    });

    test("refuses a player, a demo Game Master and an archived campaign", async () => {
      const { gm, campaign, rogue } = await setup();
      expect(CampaignDocumentsService.createDocument(rogue.session, campaign.id, newDocument())).rejects.toEqual(
        new ForbiddenError("Only the Game Master can edit this campaign"),
      );
      expect(
        CampaignDocumentsService.createDocument({ ...gm, isDemo: true }, campaign.id, newDocument()),
      ).rejects.toEqual(new ForbiddenError("Sign up to use this feature"));
      await CampaignsService.archiveCampaign(gm, campaign.id);
      expect(CampaignDocumentsService.createDocument(gm, campaign.id, newDocument())).rejects.toEqual(
        new ConflictError("This campaign is archived"),
      );
    });

    test("puts an item in one of the campaign's folders alone, 5 deep at most, a folder without text", async () => {
      const { gm, add } = await setup();
      const document = await add();
      const other = await createTestCampaign(gm.userId);
      const elsewhere = await CampaignDocumentsService.createDocument(
        gm,
        other.campaign.id,
        newDocument({ kind: "Folder" }),
      );
      for (const parentId of [document.id, elsewhere.id, NIL_UUID])
        expect(add({ parentId })).rejects.toEqual(new UnprocessableEntityError("Folder not found in this campaign"));
      expect(add({ kind: "Folder", body: "text" })).rejects.toEqual(new BadRequestError("A folder holds no text"));

      let parentId: string | null = null;
      for (let depth = 1; depth <= MAX_DOCUMENT_DEPTH; depth++) parentId = (await add({ kind: "Folder", parentId })).id;
      expect(add({ kind: "Folder", parentId })).rejects.toEqual(
        new UnprocessableEntityError(`Folders nest ${MAX_DOCUMENT_DEPTH} deep at most`),
      );
      expect((await add({ parentId })).parentId).toBe(parentId);
    });

    test("keeps a campaign's folders and documents within their count", async () => {
      const { campaign, add } = await setup();
      const rows = Array.from({ length: MAX_CAMPAIGN_DOCUMENTS - 1 }, (_, i) => ({
        campaignId: campaign.id,
        kind: "Folder",
        name: `Folder ${i}`,
      }));
      await insertRows(documentsInCampaign, rows);
      await add();
      expect(add()).rejects.toEqual(
        new ConflictError(`A campaign keeps ${MAX_CAMPAIGN_DOCUMENTS} folders and documents at most`),
      );
    });

    test("names a Selected item's players: its campaign's seats, one at least, and no other setting's", async () => {
      const { gm, rogue, add } = await setup();
      const outsider = await seat((await createTestCampaign(gm.userId)).campaign.id, "Player Character");
      expect(add({ visibility: "Selected" })).rejects.toEqual(
        new BadRequestError("A Selected folder or document names one player at least"),
      );
      expect(add({ visibility: "Public", readerIds: [rogue.player.id] })).rejects.toEqual(
        new BadRequestError("Only a Selected folder or document names its players"),
      );
      expect(add({ visibility: "Selected", readerIds: [outsider.player.id] })).rejects.toEqual(
        new UnprocessableEntityError("Player not found in this campaign"),
      );
      const shared = await add({ visibility: "Selected", readerIds: [rogue.player.id, rogue.player.id] });
      expect(shared.readerIds).toEqual([rogue.player.id]);
    });
  });

  describe("getDocuments and getDocument", () => {
    test("show a player what it and every folder above it admit them to, its Game Masters everything", async () => {
      const { gm, campaign, rogue, bard, coGm, add } = await setup();
      const act = await add({ kind: "Folder", name: "Act", visibility: "Public" });
      await add({ name: "Map", parentId: act.id, visibility: "Public" });
      await add({ name: "GM notes", parentId: act.id });
      await add({ name: "Letter", parentId: act.id, visibility: "Selected", readerIds: [rogue.player.id] });
      const prep = await add({ kind: "Folder", name: "Prep" });
      await add({ name: "Reveal", parentId: prep.id, visibility: "Public" });

      const everything = ["Act", "GM notes", "Letter", "Map", "Prep", "Reveal"];
      expect(await namesSeen(gm, campaign.id)).toEqual(everything);
      expect(await namesSeen(coGm.session, campaign.id)).toEqual(everything);
      expect(await namesSeen(rogue.session, campaign.id)).toEqual(["Act", "Letter", "Map"]);
      expect(await namesSeen(bard.session, campaign.id)).toEqual(["Act", "Map"]);

      const { session: outsider } = await createTestUser();
      expect(CampaignDocumentsService.getDocuments(outsider, campaign.id)).rejects.toEqual(
        new NotFoundError("Campaign not found"),
      );
    });

    test("tell its Game Masters whom each item admits, a player nothing of it", async () => {
      const { gm, campaign, rogue, add } = await setup();
      const folder = await add({
        kind: "Folder",
        name: "Secrets",
        visibility: "Selected",
        readerIds: [rogue.player.id],
      });
      const handout = await add({ name: "Handout", parentId: folder.id, visibility: "Public", body: "Hi" });

      const audience = { everyone: false, playerIds: [rogue.player.id] };
      expect(await CampaignDocumentsService.getDocument(gm, campaign.id, handout.id)).toMatchObject({
        visibility: "Public",
        readerIds: [],
        audience,
        body: "Hi",
      });
      expect(await CampaignDocumentsService.getDocument(rogue.session, campaign.id, handout.id)).toMatchObject({
        visibility: null,
        readerIds: null,
        audience: null,
        body: "Hi",
        path: [{ id: folder.id, name: "Secrets" }],
      });
    });

    test("refuse a hidden item as an unknown one", async () => {
      const { campaign, bard, add } = await setup();
      const hidden = await add({ name: "Twist" });
      for (const id of [hidden.id, NIL_UUID]) {
        expect(CampaignDocumentsService.getDocument(bard.session, campaign.id, id)).rejects.toEqual(
          new NotFoundError("Document not found in this campaign"),
        );
      }
    });
  });

  describe("updateDocument", () => {
    test("renames, rewrites and moves an item, as its edit read it", async () => {
      const { gm, campaign, add } = await setup();
      const folder = await add({ kind: "Folder", name: "Act" });
      const document = await add({ name: "Draft" });
      const edited = await CampaignDocumentsService.updateDocument(gm, campaign.id, document.id, {
        name: "Map",
        body: "The keep",
        parentId: folder.id,
        updatedAt: document.updatedAt,
      });
      expect(edited).toMatchObject({ name: "Map", body: "The keep", parentId: folder.id });

      expect(
        CampaignDocumentsService.updateDocument(gm, campaign.id, document.id, {
          name: "Stale",
          updatedAt: document.updatedAt,
        }),
      ).rejects.toEqual(new ConflictError(STALE_ENTITY_MESSAGE));
      const top = await CampaignDocumentsService.updateDocument(gm, campaign.id, document.id, { parentId: null });
      expect(top.parentId).toBeNull();
    });

    test("never moves a folder into itself, one of its own, or past 5 deep", async () => {
      const { gm, campaign, add } = await setup();
      const outer = await add({ kind: "Folder", name: "Outer" });
      const inner = await add({ kind: "Folder", name: "Inner", parentId: outer.id });
      const move = (id: string, parentId: string) =>
        CampaignDocumentsService.updateDocument(gm, campaign.id, id, { parentId });
      for (const parentId of [outer.id, inner.id]) {
        expect(move(outer.id, parentId)).rejects.toEqual(
          new UnprocessableEntityError("A folder can't go in itself or one of its folders"),
        );
      }

      // Outer holds two levels: three folders deep, it would stand at 5, at 4 within 6
      let parentId = (await add({ kind: "Folder" })).id;
      for (let depth = 2; depth <= 3; depth++) parentId = (await add({ kind: "Folder", parentId })).id;
      expect((await move(outer.id, parentId)).parentId).toBe(parentId);
      const deeper = (await add({ kind: "Folder", parentId })).id;
      expect(move(outer.id, deeper)).rejects.toEqual(
        new UnprocessableEntityError(`Folders nest ${MAX_DOCUMENT_DEPTH} deep at most`),
      );
    });

    test("names its players anew with a new setting, and keeps them otherwise", async () => {
      const { gm, campaign, rogue, bard, add } = await setup();
      const document = await add({ visibility: "Selected", readerIds: [rogue.player.id] });
      const update = (edit: Parameters<typeof CampaignDocumentsService.updateDocument>[3]) =>
        CampaignDocumentsService.updateDocument(gm, campaign.id, document.id, edit);

      expect((await update({ name: "Renamed" })).readerIds).toEqual([rogue.player.id]);
      expect((await update({ readerIds: [rogue.player.id, bard.player.id] })).readerIds).toEqual([
        rogue.player.id,
        bard.player.id,
      ]);
      expect(await update({ visibility: "Public" })).toMatchObject({ visibility: "Public", readerIds: [] });
      expect(update({ visibility: "Selected" })).rejects.toEqual(
        new BadRequestError("A Selected folder or document names one player at least"),
      );
      expect(update({ readerIds: [bard.player.id] })).rejects.toEqual(
        new BadRequestError("Only a Selected folder or document names its players"),
      );
    });

    test("refuses a folder's text, a player and an unknown item", async () => {
      const { gm, campaign, rogue, add } = await setup();
      const folder = await add({ kind: "Folder", visibility: "Public" });
      expect(CampaignDocumentsService.updateDocument(gm, campaign.id, folder.id, { body: "x" })).rejects.toEqual(
        new BadRequestError("A folder holds no text"),
      );
      expect(
        CampaignDocumentsService.updateDocument(rogue.session, campaign.id, folder.id, { name: "Mine" }),
      ).rejects.toEqual(new ForbiddenError("Only the Game Master can edit this campaign"));
      expect(CampaignDocumentsService.updateDocument(gm, campaign.id, NIL_UUID, { name: "x" })).rejects.toEqual(
        new NotFoundError("Document not found in this campaign"),
      );
    });
  });

  describe("removeDocument", () => {
    test("deletes a folder with whatever it holds", async () => {
      const { gm, campaign, add } = await setup();
      const folder = await add({ kind: "Folder", name: "Act" });
      const inner = await add({ kind: "Folder", name: "Scene", parentId: folder.id });
      await add({ name: "Map", parentId: inner.id });
      await add({ name: "Kept" });

      expect(await CampaignDocumentsService.removeDocument(gm, campaign.id, folder.id)).toEqual({ id: folder.id });
      expect(await namesSeen(gm, campaign.id)).toEqual(["Kept"]);
      expect(CampaignDocumentsService.removeDocument(gm, campaign.id, folder.id)).rejects.toEqual(
        new NotFoundError("Document not found in this campaign"),
      );
    });
  });

  describe("who hears of a write", () => {
    test("the players who gain an item, once, for the item written", async () => {
      const { gm, campaign, rogue, bard, coGm, add } = await setup();
      const prep = await add({ kind: "Folder", name: "Act 3" });
      await add({ name: "Handout", parentId: prep.id, visibility: "Public" });
      await add({ name: "Letter", parentId: prep.id, visibility: "Selected", readerIds: [bard.player.id] });
      expect([await inbox(rogue.user.id), await inbox(bard.user.id)]).toEqual([[], []]);

      // Revealed: each player gains the folder and what it shows them, and hears of it once
      const noted = await collectNotified(async () => {
        await CampaignDocumentsService.updateDocument(gm, campaign.id, prep.id, { visibility: "Public" });
      });
      for (const player of [rogue, bard]) expect(await inbox(player.user.id)).toEqual(["shareCampaignDocument Act 3"]);
      expect(await inbox(coGm.user.id)).toEqual([]);
      expect([...noted.notified].sort()).toEqual([rogue.user.id, bard.user.id].sort());
      expect([...noted.campaignDocuments].sort()).toEqual([rogue.user.id, bard.user.id, coGm.user.id].sort());

      // Shared with the rogue alone: the bard loses it and hears nothing, the rogue already sees it
      await CampaignDocumentsService.updateDocument(gm, campaign.id, prep.id, {
        visibility: "Selected",
        readerIds: [rogue.player.id],
      });
      for (const player of [rogue, bard]) expect(await inbox(player.user.id)).toEqual(["shareCampaignDocument Act 3"]);
    });

    test("no player for a hidden item's change, its other Game Masters alone", async () => {
      const { gm, campaign, rogue, coGm, add } = await setup();
      const hidden = await add({ name: "Twist" });
      const noted = await collectNotified(async () => {
        await CampaignDocumentsService.updateDocument(gm, campaign.id, hidden.id, { body: "The duke did it" });
      });
      expect([[...noted.notified], [...noted.campaignDocuments]]).toEqual([[], [coGm.user.id]]);
      expect(await inbox(rogue.user.id)).toEqual([]);
    });

    test("a new visible item's players, and whoever saw a removed one", async () => {
      const { gm, campaign, rogue, bard, add } = await setup();
      const created = await collectNotified(async () => {
        await add({ name: "Map", visibility: "Selected", readerIds: [rogue.player.id] });
      });
      expect([...created.notified]).toEqual([rogue.user.id]);
      expect(await inbox(rogue.user.id)).toEqual(["shareCampaignDocument Map"]);

      const handout = await add({ name: "Handout", visibility: "Public" });
      const removed = await collectNotified(async () => {
        await CampaignDocumentsService.removeDocument(gm, campaign.id, handout.id);
      });
      expect([...removed.notified]).toEqual([]);
      expect([...removed.campaignDocuments]).toEqual(expect.arrayContaining([rogue.user.id, bard.user.id]));
    });

    test("an activity's link opens an item for whoever sees it, and nowhere for whoever doesn't", async () => {
      const { gm, campaign, rogue, bard, add } = await setup();
      const letter = await add({ name: "Letter", visibility: "Selected", readerIds: [rogue.player.id] });
      const url = (session: Session) =>
        ActivitiesService.getActivityUrl(session, TARGET_TYPES.campaignDocuments, letter.id);
      const page = `/campaigns/${campaign.id}/documents/${letter.id}`;
      expect([await url(gm), await url(rogue.session), await url(bard.session)]).toEqual([page, page, null]);
    });
  });

  describe("what goes with a seat or a campaign", () => {
    test("a removed player leaves every item's list, which then admits no one", async () => {
      const { gm, campaign, rogue, add } = await setup();
      const letter = await add({ name: "Letter", visibility: "Selected", readerIds: [rogue.player.id] });
      await CampaignPlayersService.removePlayer(gm, campaign.id, rogue.player.id);

      expect(await CampaignDocumentsService.getDocument(gm, campaign.id, letter.id)).toMatchObject({
        readerIds: [],
        audience: { everyone: false, playerIds: [] },
      });
    });

    test("a campaign's permanent delete deletes its folders and documents", async () => {
      const { gm, campaign, add } = await setup();
      const folder = await add({ kind: "Folder" });
      await add({ parentId: folder.id });
      await CampaignsService.archiveCampaign(gm, campaign.id);
      await CampaignsService.hardDeleteCampaign(gm, campaign.id);

      expect(await Campaigns.findOne(db, { id: campaign.id })).toBeUndefined();
      expect(await Documents.count(db, { campaignId: campaign.id })).toBe(0);
    });
  });
});
