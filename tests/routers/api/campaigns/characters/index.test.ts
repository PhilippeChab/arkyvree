import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import { generatePdfTask } from "@/server/jobs/generatePdf.tsx";
import { Characters, PlayerCharacters, Players } from "@/server/repositories/index.ts";
import type { CampaignRole } from "@/shared/enums.ts";
import { api, createSignedInUser, expectOk, guestApi } from "@/tests/api.ts";
import { getSeedCtx, NIL_UUID, queuedPdfJobs, silentJobHelpers, uniqueId } from "@/tests/helpers.ts";

const characters = api.api.campaigns[":id"].characters;
const character = characters[":characterId"];

/** A character of the seeded user's, built on the seeded ruleset unless `rulesetId` says otherwise. */
async function createCharacter(name = `Test Character ${uniqueId()}`, rulesetId?: string) {
  const ctx = await getSeedCtx();
  const abilities = Object.fromEntries(Object.values(ctx.abilityMap).map((id) => [id, 10]));
  const created = await expectOk(
    api.api.characters.$post({
      json: {
        rulesetId: rulesetId ?? ctx.rulesetId,
        raceId: ctx.raceMap.pc["Human"],
        name,
        xp: 0,
        alignment: "True Neutral",
        abilities,
        age: 25,
        gender: "Male",
        height: "180",
        weight: "80",
      },
    }),
  );
  return created.id;
}

/** A campaign of the seeded user's and a character of theirs, not linked yet. */
async function setup() {
  const { rulesetId } = await getSeedCtx();
  const { campaign } = await expectOk(api.api.campaigns.$post({ json: { name: "Characters Campaign", rulesetId } }));
  return { campaignId: campaign.id, characterId: await createCharacter() };
}

/** Adds a new user to the campaign with `role`, and returns a client signed in as them. */
async function join(campaignId: string, role: CampaignRole) {
  const member = await createSignedInUser("member");
  const [player] = await Players.create(db, { campaignId, userId: member.user.id, role });
  return { ...member, player };
}

describe("campaigns characters", () => {
  test("links a character, lists it and finds it by name", async () => {
    const { campaignId, characterId } = await setup();
    expect((await expectOk(characters.$get({ param: { id: campaignId }, query: {} }))).items).toEqual([]);

    const linked = await characters.$post({ param: { id: campaignId }, json: { characterId } });
    expect(linked.status).toBe(201);
    expect(await expectOk(linked)).toMatchObject({ characterId, visibility: "Private" });

    const list = async (search?: string) =>
      (await expectOk(characters.$get({ param: { id: campaignId }, query: { search } }))).items.map((c) => c.id);
    expect(await list()).toEqual([characterId]);
    expect(await list("Test Character")).toEqual([characterId]);
    expect(await list("no-character-matches-this")).toEqual([]);
  });

  test("pages the linked characters", async () => {
    const { campaignId } = await setup();
    for (let i = 0; i < 3; i++) {
      await expectOk(characters.$post({ param: { id: campaignId }, json: { characterId: await createCharacter() } }));
    }
    const page1 = await expectOk(characters.$get({ param: { id: campaignId }, query: { limit: "2", page: "1" } }));
    expect(page1.items).toHaveLength(2);
    expect(page1.nextPage).toBe(2);
    const page2 = await expectOk(characters.$get({ param: { id: campaignId }, query: { limit: "2", page: "2" } }));
    expect(page2.items).toHaveLength(1);
  });

  test("links a character with a visibility and changes it", async () => {
    const { campaignId, characterId } = await setup();
    expect(
      await expectOk(characters.$post({ param: { id: campaignId }, json: { characterId, visibility: "Public" } })),
    ).toMatchObject({ visibility: "Public" });
    const updated = await expectOk(
      character.$put({ param: { id: campaignId, characterId }, json: { visibility: "Partial" } }),
    );
    expect(updated).toMatchObject({ characterId, visibility: "Partial" });
  });

  test("refuses a character built on another ruleset", async () => {
    const { rulesetId } = await getSeedCtx();
    const { campaignId } = await setup();
    const fork = await expectOk(
      api.api.rulesets[":id"].fork.$post({
        param: { id: rulesetId },
        json: { name: "Link Test Fork", description: "", private: true },
      }),
    );
    const characterId = await createCharacter("Fork Character", fork.id);

    const response = await characters.$post({ param: { id: campaignId }, json: { characterId } });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      message: "Only characters built on the campaign's ruleset can be linked",
    });
  });

  test("refuses to link the same character twice", async () => {
    const { campaignId, characterId } = await setup();
    await expectOk(characters.$post({ param: { id: campaignId }, json: { characterId } }));
    expect((await characters.$post({ param: { id: campaignId }, json: { characterId } })).status).toBe(409);
  });

  for (const visibility of ["Partial", "Public"] as const) {
    test(`${visibility} hides private notes and share tokens from other players`, async () => {
      const { campaignId, characterId } = await setup();
      const shareToken = crypto.randomUUID();
      await Characters.update(db, { privateNotes: "Secret GM notes", shareToken }, { id: characterId });
      await expectOk(characters.$post({ param: { id: campaignId }, json: { characterId, visibility } }));
      const viewer = await join(campaignId, "Player Character");

      const body = await expectOk(
        viewer.api.api.campaigns[":id"].characters[":characterId"].$get({ param: { id: campaignId, characterId } }),
      );
      expect(body.shareToken).toBeNull();
      expect(body.identity.background.privateNotes).toBe("");
      expect(JSON.stringify(body)).not.toContain("Secret GM notes");
      expect(JSON.stringify(body)).not.toContain(shareToken);
      if (visibility === "Partial") {
        expect(body).toMatchObject({
          equipment: [],
          virtualFeats: [],
          virtualPowers: [],
          spellTags: {},
          bonded: {},
          skillBudget: { available: 0, spent: 0, total: 0 },
          validation: { valid: true, issues: [] },
        });
      }

      const own = await expectOk(character.$get({ param: { id: campaignId, characterId } }));
      expect(own.identity.background.privateNotes).toBe("Secret GM notes");
      expect(own.shareToken).toBe(shareToken);
    });
  }

  describe("PDF export", () => {
    /** The seeded user's character linked as a Private player character, and a new member with `role`. */
    async function setupExport(role: CampaignRole) {
      const { campaignId, characterId } = await setup();
      const owner = (await Players.findOne(db, { campaignId, userId: SEED_USER_ID }))!;
      await Players.update(db, { role: "Player Character" }, { id: owner.id });
      await PlayerCharacters.create(db, { playerId: owner.id, characterId, visibility: "Private" });
      return { campaignId, characterId, member: await join(campaignId, role) };
    }

    async function queuedPdfPayload(characterId: string) {
      const jobs = await queuedPdfJobs(characterId);
      expect(jobs).toHaveLength(1);
      return jobs[0].payload;
    }

    test("lets the Game Master export a player's character", async () => {
      const { campaignId, characterId, member } = await setupExport("Game Master");
      const theirs = member.api.api.campaigns[":id"].characters[":characterId"];
      const param = { id: campaignId, characterId };

      expect(await expectOk(theirs.$get({ param }))).toMatchObject({ canEdit: false, canDownloadPdf: true });
      expect((await theirs.pdf.$post({ param })).status).toBe(202);
      expect(await queuedPdfPayload(characterId)).toMatchObject({ userId: member.user.id, characterId, campaignId });
    });

    test("lets the character's owner export it from the campaign", async () => {
      const { campaignId, characterId } = await setupExport("Game Master");
      const param = { id: campaignId, characterId };
      expect(await expectOk(character.$get({ param }))).toMatchObject({ canDownloadPdf: true });
      expect((await character.pdf.$post({ param })).status).toBe(202);
    });

    test("links the export's activity to the campaign character page", async () => {
      const { campaignId, characterId, member } = await setupExport("Game Master");
      expect(
        (
          await member.api.api.campaigns[":id"].characters[":characterId"].pdf.$post({
            param: { id: campaignId, characterId },
          })
        ).status,
      ).toBe(202);

      const activity = await db.query.activitiesInAccount.findFirst({
        where: (t, { and, eq }) =>
          and(eq(t.userId, member.user.id), eq(t.targetId, characterId), eq(t.type, "generatePdf")),
      });
      const resolved = await expectOk(
        member.api.api.activities.resolve[":targetTable"][":targetId"].$get({
          param: { targetTable: activity!.targetTable, targetId: characterId },
        }),
      );
      expect(resolved.url).toBe(`/campaigns/${campaignId}/characters/${characterId}`);
    });

    test("the worker skips the export when the Game Master left the campaign before it ran", async () => {
      const { campaignId, characterId, member } = await setupExport("Game Master");
      expect(
        (
          await member.api.api.campaigns[":id"].characters[":characterId"].pdf.$post({
            param: { id: campaignId, characterId },
          })
        ).status,
      ).toBe(202);
      await Players.delete(db, { id: member.player.id });

      await generatePdfTask(await queuedPdfPayload(characterId), silentJobHelpers);

      const notification = await db.query.notificationsInAccount.findFirst({
        where: (t, { and, eq }) => and(eq(t.recipientId, member.user.id), eq(t.targetId, characterId)),
      });
      expect(notification).toMatchObject({ type: "pdfFailed", targetTable: "player_characters" });
      expect(
        await db.query.exportsInAccount.findFirst({ where: (t, { eq }) => eq(t.userId, member.user.id) }),
      ).toBeUndefined();
    });

    test("refuses other players and non-members", async () => {
      const { campaignId, characterId, member } = await setupExport("Player Character");
      const { api: outsider } = await createSignedInUser("outsider");
      for (const client of [member.api, outsider]) {
        const response = await client.api.campaigns[":id"].characters[":characterId"].pdf.$post({
          param: { id: campaignId, characterId },
        });
        expect(response.status).toBe(404);
      }
    });

    // Archiving makes a campaign read-only; its character pages stay viewable.
    test("still lets the Game Master export from an archived campaign", async () => {
      const { campaignId, characterId, member } = await setupExport("Game Master");
      await expectOk(member.api.api.campaigns[":id"].$delete({ param: { id: campaignId } }));
      expect(
        (
          await member.api.api.campaigns[":id"].characters[":characterId"].pdf.$post({
            param: { id: campaignId, characterId },
          })
        ).status,
      ).toBe(202);
    });

    test("returns 404 for a character not linked to the campaign", async () => {
      const { campaignId, characterId } = await setup();
      expect((await character.pdf.$post({ param: { id: campaignId, characterId } })).status).toBe(404);
    });
  });

  test("requires a session", async () => {
    const { campaignId, characterId } = await setup();
    const guest = guestApi.api.campaigns[":id"].characters;
    expect((await guest.$get({ param: { id: campaignId }, query: {} })).status).toBe(401);
    expect((await guest.$post({ param: { id: campaignId }, json: { characterId } })).status).toBe(401);
  });

  test("rejects a link without a valid character id", async () => {
    const { campaignId } = await setup();
    expect((await characters.$post({ param: { id: campaignId }, json: {} as never })).status).toBe(400);
    expect((await characters.$post({ param: { id: campaignId }, json: { characterId: "not-a-uuid" } })).status).toBe(
      400,
    );
  });

  test("returns 404 for a missing campaign", async () => {
    const { characterId } = await setup();
    expect((await characters.$post({ param: { id: NIL_UUID }, json: { characterId } })).status).toBe(404);
  });
});
