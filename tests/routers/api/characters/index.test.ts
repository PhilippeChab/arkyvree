import { describe, expect, test } from "bun:test";

import { SEED_USER_ID } from "@/database/seeds/users.ts";
import { api, createSignedInUser, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { postCampaign } from "@/tests/support/campaigns.ts";
import { postCharacter } from "@/tests/support/characters.ts";
import { addCharacterContributor } from "@/tests/support/contributors.ts";
import { createWizardWithFamiliar } from "@/tests/support/levelFixtures.ts";
import { createSeededTestRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

const characters = api.api.characters;
const character = characters[":id"];

/** What only a character's editors read, and its campaign's Game Master. */
const PRIVATE_NOTES = "Plans to betray the party";

async function languageNames(id: string) {
  return (await expectOk(character.$get({ param: { id } }))).identity.physiology.languages.map((l) => l.name).sort();
}

describe("characters", () => {
  test("creates, reads, lists and updates a character", async () => {
    const ctx = await getSeedCtx();
    const created = await postCharacter({ name: "Router Character" });
    expect(created).toMatchObject({
      name: "Router Character",
      rulesetId: ctx.rulesetId,
      raceId: ctx.raceMap.pc["Human"],
    });

    expect(await expectOk(character.$get({ param: { id: created.id } }))).toMatchObject({ id: created.id });
    const list = await expectOk(characters.$get({ query: { search: "Router Character" } }));
    expect(list.items.map((c) => c.id)).toEqual([created.id]);
    expect((await expectOk(characters.$get({ query: { limit: "1" } }))).items).toHaveLength(1);

    const update = {
      age: 30,
      gender: "Female" as const,
      height: "5'6\"",
      weight: "130 lbs",
      xp: 1000,
      alignment: "Chaotic Good" as const,
    };
    expect(await expectOk(character.$put({ param: { id: created.id }, json: update }))).toMatchObject(update);
  });

  test("clears a character's age, height and weight with null, and refuses an age below 1", async () => {
    const { id } = await postCharacter({ age: 30, height: "180", weight: "80" });
    const cleared = await expectOk(character.$put({ param: { id }, json: { age: null, height: null, weight: null } }));
    expect(cleared).toMatchObject({ age: null, height: null, weight: null });
    await expectStatus(character.$put({ param: { id }, json: { age: 0 } }), 400);
    await expectStatus(character.$put({ param: { id }, json: { age: 2.5 } }), 400);
  });

  test("lists the races a new character can pick", async () => {
    const ctx = await getSeedCtx();
    const races = await expectOk(
      characters["available-races"].$get({ query: { rulesetId: ctx.rulesetId, search: "Human" } }),
    );
    expect(races.items.map((r) => r.id)).toContain(ctx.raceMap.pc["Human"]);
  });

  test("lists the characters not linked to a campaign yet", async () => {
    const campaign = await postCampaign();
    const created = await postCharacter();
    const unlinked = await expectOk(
      characters.unlinked[":campaignId"].$get({ param: { campaignId: campaign.id }, query: {} }),
    );
    expect(unlinked.items.map((c) => c.id)).toContain(created.id);

    await expectOk(
      api.api.campaigns[":id"].characters.$post({ param: { id: campaign.id }, json: { characterId: created.id } }),
    );
    const after = await expectOk(
      characters.unlinked[":campaignId"].$get({ param: { campaignId: campaign.id }, query: {} }),
    );
    expect(after.items.map((c) => c.id)).not.toContain(created.id);
  });

  test("archives, unarchives and permanently deletes a character", async () => {
    const { id } = await postCharacter();
    expect(await expectOk(character.$delete({ param: { id } }))).toEqual({
      message: "Character archived successfully",
    });
    expect(await expectOk(character.unarchive.$post({ param: { id } }))).toEqual({
      message: "Character unarchived successfully",
    });

    await expectOk(character.$delete({ param: { id } }));
    await expectOk(character.permanent.$delete({ param: { id } }));
    await expectStatus(character.$get({ param: { id } }), 404);
  });

  test("only deletes an archived character permanently", async () => {
    const { id } = await postCharacter();
    await expectStatus(character.permanent.$delete({ param: { id } }), 404);
  });

  test("enqueues a PDF of the character", async () => {
    const { id } = await postCharacter();
    expect((await characters[":characterId"].pdf.$post({ param: { characterId: id } })).status).toBe(202);
  });

  test("tags a caster's spells with the domains the character picked", async () => {
    // Theron, a seeded cleric, picked the Healing and Sun domains.
    const [theron] = (await expectOk(characters.$get({ query: { search: "Theron Lightbringer" } }))).items;
    const detail = await expectOk(character.$get({ param: { id: theron.id } }));

    const tags = [...new Set(Object.values(detail.spellTags).flat())].sort();
    expect(tags).toEqual(["Healing Domain", "Sun Domain"]);
    const classPowerIds = new Set(
      Object.values(detail.classes).flatMap((klass) => klass.levels.flatMap((level) => level.powers.map((p) => p.id))),
    );
    expect(Object.keys(detail.spellTags).some((id) => classPowerIds.has(id))).toBe(true);
  });

  describe("abilities", () => {
    test("sets an ability's base score", async () => {
      const { abilityMap } = await getSeedCtx();
      const { id } = await postCharacter();
      await expectOk(character.abilities.$put({ param: { id }, json: { [abilityMap["Strength"]]: 18 } }));

      const detail = await expectOk(character.$get({ param: { id } }));
      const strength = Object.values(detail.abilities).find((a) => a.abilityId === abilityMap["Strength"]);
      expect(strength).toMatchObject({ base: 18, total: 18, modifier: 4 });
    });

    test("returns 404 for an ability the ruleset doesn't have", async () => {
      const { id } = await postCharacter();
      await expectStatus(character.abilities.$put({ param: { id }, json: { [NIL_UUID]: 15 } }), 404);
    });

    test("refuses a score past the ruleset's bounds", async () => {
      const { abilityMap } = await getSeedCtx();
      const { id } = await postCharacter();
      for (const score of [0, 1000])
        await expectStatus(character.abilities.$put({ param: { id }, json: { [abilityMap["Strength"]]: score } }), 400);
    });
  });

  describe("languages", () => {
    test("sets, replaces and clears a character's languages", async () => {
      const { langMap } = await getSeedCtx();
      const { id } = await postCharacter();

      await expectOk(
        character.languages.$put({ param: { id }, json: { languageIds: [langMap["Common"], langMap["Draconic"]] } }),
      );
      expect(await languageNames(id)).toEqual(["Common", "Draconic"]);
      await expectOk(character.languages.$put({ param: { id }, json: { languageIds: [langMap["Elven"]] } }));
      expect(await languageNames(id)).toEqual(["Elven"]);
      await expectOk(character.languages.$put({ param: { id }, json: { languageIds: [] } }));
      expect(await languageNames(id)).toEqual([]);
    });

    test("rejects a language the ruleset doesn't have", async () => {
      const { id } = await postCharacter();
      await expectStatus(character.languages.$put({ param: { id }, json: { languageIds: [NIL_UUID] } }), 400);
    });

    test("rejects a language its fork deleted, or one sent twice", async () => {
      const { langMap } = await getSeedCtx();
      const fork = await createSeededTestRuleset(SEED_USER_ID);
      const language = api.api.rulesets[":id"].languages[":languageId"];
      await expectOk(language.$delete({ param: { id: fork.id, languageId: langMap["Draconic"] } }));
      const { id } = await postCharacter({ rulesetId: fork.id });

      const put = (languageIds: string[]) => character.languages.$put({ param: { id }, json: { languageIds } });
      await expectStatus(put([langMap["Draconic"]]), 400);
      await expectStatus(put([langMap["Common"], langMap["Common"]]), 400);
      await expectOk(put([langMap["Common"]]));
    });
  });

  describe("private notes", () => {
    test("creates a character with its private notes, beside its notes", async () => {
      const { id, privateNotes } = await postCharacter({ notes: "Public notes", privateNotes: PRIVATE_NOTES });
      expect(privateNotes).toBe(PRIVATE_NOTES);
      expect((await expectOk(character.$get({ param: { id } }))).identity.background).toEqual({
        notes: "Public notes",
        privateNotes: PRIVATE_NOTES,
      });
    });

    test("saves a character's private notes, which its editors read and no one else", async () => {
      const { id } = await postCharacter({ notes: "Public notes" });
      const saved = await expectOk(character.$put({ param: { id }, json: { privateNotes: PRIVATE_NOTES } }));
      expect(saved).toMatchObject({ notes: "Public notes", privateNotes: PRIVATE_NOTES });
      expect((await expectOk(character.$get({ param: { id } }))).identity.background).toEqual({
        notes: "Public notes",
        privateNotes: PRIVATE_NOTES,
      });

      const contributor = await createSignedInUser("contributor");
      await addCharacterContributor(id, contributor.user, SEED_USER_ID);
      const theirs = contributor.api.api.characters[":id"];
      await expectOk(theirs.$put({ param: { id }, json: { privateNotes: "Edited by a contributor" } }));
      expect((await expectOk(theirs.$get({ param: { id } }))).identity.background.privateNotes).toBe(
        "Edited by a contributor",
      );

      const { api: outsider } = await createSignedInUser("outsider");
      await expectStatus(outsider.api.characters[":id"].$get({ param: { id } }), 404);
      await expectStatus(outsider.api.characters[":id"].$put({ param: { id }, json: { privateNotes: "" } }), 404);
    });

    test("saves a bonded creature's private notes, which its master's sheet holds", async () => {
      const { masterId, bonded } = await createWizardWithFamiliar();
      await expectOk(character.$put({ param: { id: bonded.id }, json: { privateNotes: PRIVATE_NOTES } }));

      const own = await expectOk(character.$get({ param: { id: bonded.id } }));
      expect(own.identity.background.privateNotes).toBe(PRIVATE_NOTES);
      const master = await expectOk(character.$get({ param: { id: masterId } }));
      expect(master.bonded.familiar?.identity.background.privateNotes).toBe(PRIVATE_NOTES);
    });
  });

  describe("sharing", () => {
    test("shares a character with anyone holding its token, without its private notes", async () => {
      const { id } = await postCharacter();
      await expectOk(character.$put({ param: { id }, json: { privateNotes: PRIVATE_NOTES } }));
      const { shareToken } = await expectOk(character.share.$post({ param: { id } }));
      expect(shareToken).toEqual(expect.any(String));
      expect(await expectOk(character.$get({ param: { id } }))).toMatchObject({ shareToken });

      const shared = guestApi.api.shared.characters[":shareToken"];
      const sheet = await expectOk(shared.$get({ param: { shareToken: shareToken! } }));
      expect(sheet.id).toBe(id);
      expect(sheet.identity.background).not.toHaveProperty("privateNotes");
      expect(JSON.stringify(sheet)).not.toContain(PRIVATE_NOTES);

      const pdf = await shared.pdf.$get({ param: { shareToken: shareToken! } });
      expect(pdf.status).toBe(200);
      expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    });

    test("shares a master's bonded creature without its private notes", async () => {
      const { masterId, bonded } = await createWizardWithFamiliar();
      await expectOk(character.$put({ param: { id: bonded.id }, json: { privateNotes: PRIVATE_NOTES } }));
      const { shareToken } = await expectOk(character.share.$post({ param: { id: masterId } }));

      const sheet = await expectOk(
        guestApi.api.shared.characters[":shareToken"].$get({ param: { shareToken: shareToken! } }),
      );
      expect(sheet.bonded.familiar?.identity.background).not.toHaveProperty("privateNotes");
      expect(JSON.stringify(sheet)).not.toContain(PRIVATE_NOTES);
    });

    test("stops sharing once the token is revoked", async () => {
      const { id } = await postCharacter();
      const { shareToken } = await expectOk(character.share.$post({ param: { id } }));
      expect(await expectOk(character.share.$delete({ param: { id } }))).toMatchObject({ shareToken: null });
      const shared = guestApi.api.shared.characters[":shareToken"];
      await expectStatus(shared.$get({ param: { shareToken: shareToken! } }), 404);
      await expectStatus(shared.pdf.$get({ param: { shareToken: shareToken! } }), 404);
    });

    test("returns 404 for an unknown token, the sheet's PDF too", async () => {
      const shared = guestApi.api.shared.characters[":shareToken"];
      await expectStatus(shared.$get({ param: { shareToken: NIL_UUID } }), 404);
      await expectStatus(shared.pdf.$get({ param: { shareToken: NIL_UUID } }), 404);
    });
  });

  test("requires a session", async () => {
    const { id } = await postCharacter();
    await expectStatus(guestApi.api.characters.$get({ query: {} }), 401);
    await expectStatus(guestApi.api.characters[":id"].share.$post({ param: { id } }), 401);
    await expectStatus(guestApi.api.characters[":id"].abilities.$put({ param: { id }, json: {} }), 401);
  });

  test("rejects a character without a name, or with an unknown alignment or gender", async () => {
    const ctx = await getSeedCtx();
    const valid = {
      rulesetId: ctx.rulesetId,
      raceId: ctx.raceMap.pc["Human"],
      name: "Test",
      xp: 0,
      alignment: "True Neutral",
      abilities: {},
      age: 25,
      gender: "Male",
      height: "5'10\"",
      weight: "170 lbs",
    };
    for (const json of [{ xp: 0 }, { ...valid, alignment: "Invalid Alignment" }, { ...valid, gender: "InvalidGender" }])
      await expectStatus(characters.$post({ json: json as never }), 400);
  });

  test("returns 404 for a missing character", async () => {
    const param = { id: NIL_UUID };
    await expectStatus(character.$get({ param }), 404);
    await expectStatus(character.$put({ param, json: { age: 30 } }), 404);
    await expectStatus(character.$delete({ param }), 404);
    await expectStatus(character.unarchive.$post({ param }), 404);
  });
});
