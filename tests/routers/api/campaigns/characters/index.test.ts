import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { generatePdfTask } from "@/server/jobs/generatePdf.ts";
import { Characters, PlayerCharacters, Players } from "@/server/repositories/index.ts";
import type { CampaignRole } from "@/shared/enums.ts";
import { api, createSignedInUser, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { postCampaign } from "@/tests/support/campaigns.ts";
import { postCharacter } from "@/tests/support/characters.ts";
import { addCharacterContributor } from "@/tests/support/contributors.ts";
import { queuedPdfJobs, silentJobHelpers } from "@/tests/support/jobs.ts";
import { createWizardWithFamiliar } from "@/tests/support/levelFixtures.ts";
import { addCharacterLevel, findKlassLevel } from "@/tests/support/levels.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

type Client = typeof api;

const characters = api.api.campaigns[":id"].characters;
const character = characters[":characterId"];

/** What a filled character holds that a Partial one hides from the other players. */
const SECRETS = {
  deity: "Olidammara",
  description: "A scar runs down her left cheek",
  notes: "Owes the thieves' guild a favor",
  privateNotes: "Plans to betray the party",
};

/** Adds a new user to the campaign with `role`, and returns a client signed in as them. */
async function join(campaignId: string, role: CampaignRole) {
  const member = await createSignedInUser("member");
  const [player] = await Players.create(db, { campaignId, userId: member.user.id, role });
  return { ...member, player };
}

/**
 * A campaign the seeded user plays in, with `characterId` linked as `visibility`, and its Game Master, a contributor of
 * the character and another player, each a new member.
 */
async function linkWithMembers(characterId: string, visibility: "Partial" | "Public") {
  const campaignId = (await postCampaign()).id;
  const owner = (await Players.findOne(db, { campaignId, userId: SEED_USER_ID }))!;
  await Players.update(db, { role: "Player Character" }, { id: owner.id });
  await expectOk(characters.$post({ param: { id: campaignId }, json: { characterId, visibility } }));
  const contributor = await join(campaignId, "Player Character");
  await addCharacterContributor(characterId, contributor.user, SEED_USER_ID);
  return {
    campaignId,
    gm: await join(campaignId, "Game Master"),
    contributor,
    player: await join(campaignId, "Player Character"),
  };
}

/** The seeded user's character with a description, notes, private notes, a deity, an alignment, a language and a level. */
async function postFilledCharacter() {
  const { klassMap, langMap } = await getSeedCtx();
  const { deity, description, notes, privateNotes } = SECRETS;
  const { id } = await postCharacter({ alignment: "Chaotic Good", deity, description, notes });
  await expectOk(
    api.api.characters[":id"].$put({ param: { id }, json: { privateNotes, languageIds: [langMap["Draconic"]] } }),
  );
  await addCharacterLevel(id, (await findKlassLevel(klassMap.pc["Fighter"], 1))!.id);
  return id;
}

async function queuedPdfPayload(characterId: string) {
  const jobs = await queuedPdfJobs(characterId);
  expect(jobs).toHaveLength(1);
  return jobs[0].payload;
}

/** The campaign's roster as `client` sees it. */
async function rosterOf(client: Client, campaignId: string) {
  return (await expectOk(client.api.campaigns[":id"].characters.$get({ param: { id: campaignId }, query: {} }))).items;
}

/** A campaign of the seeded user's and a character of theirs, not linked yet. */
async function setup() {
  return { campaignId: (await postCampaign()).id, characterId: (await postCharacter()).id };
}

/** The seeded user's character linked as a Private player character, and a new member with `role`. */
async function setupExport(role: CampaignRole) {
  const { campaignId, characterId } = await setup();
  const owner = (await Players.findOne(db, { campaignId, userId: SEED_USER_ID }))!;
  await Players.update(db, { role: "Player Character" }, { id: owner.id });
  await PlayerCharacters.create(db, { playerId: owner.id, characterId, visibility: "Private" });
  return { campaignId, characterId, member: await join(campaignId, role) };
}

/** The campaign character's sheet as `client` sees it. */
async function sheetOf(client: Client, campaignId: string, characterId: string) {
  return await expectOk(
    client.api.campaigns[":id"].characters[":characterId"].$get({ param: { id: campaignId, characterId } }),
  );
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
      await expectOk(
        characters.$post({ param: { id: campaignId }, json: { characterId: (await postCharacter()).id } }),
      );
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
    const characterId = (await postCharacter({ name: "Fork Character", rulesetId: fork.id })).id;

    const response = await characters.$post({ param: { id: campaignId }, json: { characterId } });
    await expectStatus(response, 400);
    expect(await response.json()).toMatchObject({
      message: "Only characters built on the campaign's ruleset can be linked",
    });
  });

  test("refuses to link the same character twice", async () => {
    const { campaignId, characterId } = await setup();
    await expectOk(characters.$post({ param: { id: campaignId }, json: { characterId } }));
    await expectStatus(characters.$post({ param: { id: campaignId }, json: { characterId } }), 409);
  });

  test("Public hides private notes and share tokens from other players", async () => {
    const { campaignId, characterId } = await setup();
    const shareToken = crypto.randomUUID();
    await Characters.update(db, { privateNotes: SECRETS.privateNotes, shareToken }, { id: characterId });
    await expectOk(characters.$post({ param: { id: campaignId }, json: { characterId, visibility: "Public" } }));
    const viewer = await join(campaignId, "Player Character");

    const body = await sheetOf(viewer.api, campaignId, characterId);
    expect(body.shareToken).toBeNull();
    expect(body.identity.background?.privateNotes).toBe("");
    expect(JSON.stringify(body)).not.toContain(SECRETS.privateNotes);
    expect(JSON.stringify(body)).not.toContain(shareToken);

    const own = await sheetOf(api, campaignId, characterId);
    expect(own.identity.background?.privateNotes).toBe(SECRETS.privateNotes);
    expect(own.shareToken).toBe(shareToken);
  });

  test("Partial shows other players a character's name and physical traits, and nothing else", async () => {
    const characterId = await postFilledCharacter();
    const shareToken = crypto.randomUUID();
    await Characters.update(db, { shareToken }, { id: characterId });
    const { campaignId, gm, contributor, player } = await linkWithMembers(characterId, "Partial");

    const sheet = await sheetOf(player.api, campaignId, characterId);
    expect(sheet.identity).toEqual({
      background: null,
      beliefs: null,
      meta: null,
      physiology: {
        name: expect.stringMatching(/^Test Character/),
        race: expect.objectContaining({ name: "Human" }),
        age: 25,
        gender: "Male",
        height: "180",
        weight: "80",
        description: null,
        languages: null,
      },
    });
    expect(sheet).toMatchObject({
      isPartial: true,
      shareToken: null,
      classes: {},
      equipment: [],
      virtualFeats: [],
      virtualPowers: [],
      spellTags: {},
      bonded: {},
      skillBudget: { available: 0, spent: 0, total: 0 },
      validation: { valid: true, issues: [] },
    });
    const text = JSON.stringify(sheet);
    for (const hidden of [...Object.values(SECRETS), "Chaotic Good", "Draconic", "Fighter", shareToken])
      expect(text).not.toContain(hidden);

    expect(await rosterOf(player.api, campaignId)).toEqual([
      {
        id: characterId,
        name: sheet.identity.physiology.name,
        description: null,
        race: "Human",
        levels: [],
        totalLevel: null,
        visibility: "Partial",
        isOwn: false,
        isPartial: true,
      },
    ]);

    // The Game Master and the character's contributor see it whole, on its sheet and on its card alike.
    for (const viewer of [gm, contributor]) {
      const whole = await sheetOf(viewer.api, campaignId, characterId);
      expect(whole.isPartial).toBe(false);
      expect(whole.identity).toMatchObject({
        background: { notes: SECRETS.notes, privateNotes: SECRETS.privateNotes },
        beliefs: { alignment: "Chaotic Good", deity: SECRETS.deity },
        meta: { level: 1 },
        physiology: { description: SECRETS.description, languages: [expect.objectContaining({ name: "Draconic" })] },
      });
      expect((await rosterOf(viewer.api, campaignId))[0]).toMatchObject({
        description: SECRETS.description,
        levels: [expect.objectContaining({ klass: "Fighter", level: 1 })],
        totalLevel: 1,
        isPartial: false,
      });
    }
  });

  test("shows a character's private notes to its editors and the Game Master, and blank to the other players", async () => {
    const characterId = (await postCharacter()).id;
    await expectOk(
      api.api.characters[":id"].$put({ param: { id: characterId }, json: { privateNotes: SECRETS.privateNotes } }),
    );
    const { campaignId, gm, contributor, player } = await linkWithMembers(characterId, "Public");

    // The notes, and whether the sheet shows their field
    const privateNotesOf = async (client: Client) => {
      const sheet = await sheetOf(client, campaignId, characterId);
      return [sheet.identity.background?.privateNotes, sheet.showPrivateNotes];
    };
    expect(await privateNotesOf(api)).toEqual([SECRETS.privateNotes, true]);
    expect(await privateNotesOf(contributor.api)).toEqual([SECRETS.privateNotes, true]);
    expect(await privateNotesOf(gm.api)).toEqual([SECRETS.privateNotes, true]);
    expect(await privateNotesOf(player.api)).toEqual(["", false]);
  });

  test("shows a bonded creature's private notes to whoever reads its master's", async () => {
    const { masterId, bonded } = await createWizardWithFamiliar();
    await Characters.update(db, { privateNotes: SECRETS.privateNotes }, { id: bonded.id });
    const { campaignId, gm, contributor, player } = await linkWithMembers(masterId, "Public");

    const familiarNotesOf = async (client: Client) => {
      const familiar = Object.values((await sheetOf(client, campaignId, masterId)).bonded)[0];
      return familiar?.identity.background.privateNotes;
    };
    expect(await familiarNotesOf(api)).toBe(SECRETS.privateNotes);
    expect(await familiarNotesOf(contributor.api)).toBe(SECRETS.privateNotes);
    expect(await familiarNotesOf(gm.api)).toBe(SECRETS.privateNotes);
    expect(await familiarNotesOf(player.api)).toBe("");
  });

  describe("PDF export", () => {
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
        await expectStatus(response, 404);
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
      await expectStatus(character.pdf.$post({ param: { id: campaignId, characterId } }), 404);
    });
  });

  test("requires a session", async () => {
    const { campaignId, characterId } = await setup();
    const guest = guestApi.api.campaigns[":id"].characters;
    await expectStatus(guest.$get({ param: { id: campaignId }, query: {} }), 401);
    await expectStatus(guest.$post({ param: { id: campaignId }, json: { characterId } }), 401);
  });

  test("rejects a link without a valid character id", async () => {
    const { campaignId } = await setup();
    await expectStatus(characters.$post({ param: { id: campaignId }, json: {} as never }), 400);
    await expectStatus(characters.$post({ param: { id: campaignId }, json: { characterId: "not-a-uuid" } }), 400);
  });

  test("returns 404 for a missing campaign", async () => {
    const { characterId } = await setup();
    await expectStatus(characters.$post({ param: { id: NIL_UUID }, json: { characterId } }), 404);
  });
});
