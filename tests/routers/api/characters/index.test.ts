import { describe, expect, test } from "bun:test";

import { api, expectOk, expectStatus, guestApi } from "@/tests/api.ts";
import { getSeedCtx, NIL_UUID, uniqueId } from "@/tests/helpers.ts";

const characters = api.api.characters;
const character = characters[":id"];

async function createCharacter(name = `Test Character ${uniqueId()}`) {
  const ctx = await getSeedCtx();
  const abilities = Object.fromEntries(Object.values(ctx.abilityMap).map((id) => [id, 10]));
  return await expectOk(
    characters.$post({
      json: {
        rulesetId: ctx.rulesetId,
        raceId: ctx.raceMap.pc["Human"],
        name,
        xp: 0,
        alignment: "True Neutral",
        abilities,
        age: 25,
        gender: "Male",
        height: "5'10\"",
        weight: "170 lbs",
      },
    }),
  );
}

async function languageNames(id: string) {
  return (await expectOk(character.$get({ param: { id } }))).identity.physiology.languages.map((l) => l.name).sort();
}

describe("characters", () => {
  test("creates, reads, lists and updates a character", async () => {
    const ctx = await getSeedCtx();
    const created = await createCharacter("Router Character");
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

  test("lists the races a new character can pick", async () => {
    const ctx = await getSeedCtx();
    const races = await expectOk(
      characters["available-races"].$get({ query: { rulesetId: ctx.rulesetId, search: "Human" } }),
    );
    expect(races.items.map((r) => r.id)).toContain(ctx.raceMap.pc["Human"]);
  });

  test("lists the characters not linked to a campaign yet", async () => {
    const { rulesetId } = await getSeedCtx();
    const { campaign } = await expectOk(api.api.campaigns.$post({ json: { name: "Unlinked Campaign", rulesetId } }));
    const created = await createCharacter();
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
    const { id } = await createCharacter();
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
    const { id } = await createCharacter();
    await expectStatus(character.permanent.$delete({ param: { id } }), 404);
  });

  test("enqueues a PDF of the character", async () => {
    const { id } = await createCharacter();
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
      const { id } = await createCharacter();
      await expectOk(character.abilities.$put({ param: { id }, json: { [abilityMap["Strength"]]: 18 } }));

      const detail = await expectOk(character.$get({ param: { id } }));
      const strength = Object.values(detail.abilities).find((a) => a.abilityId === abilityMap["Strength"]);
      expect(strength).toMatchObject({ base: 18, total: 18, modifier: 4 });
    });

    test("returns 404 for an ability the ruleset doesn't have", async () => {
      const { id } = await createCharacter();
      await expectStatus(character.abilities.$put({ param: { id }, json: { [NIL_UUID]: 15 } }), 404);
    });
  });

  describe("languages", () => {
    test("sets, replaces and clears a character's languages", async () => {
      const { langMap } = await getSeedCtx();
      const { id } = await createCharacter();

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
      const { id } = await createCharacter();
      await expectStatus(character.languages.$put({ param: { id }, json: { languageIds: [NIL_UUID] } }), 400);
    });
  });

  describe("sharing", () => {
    test("shares a character with anyone holding its token, without its private notes", async () => {
      const { id } = await createCharacter();
      const { shareToken } = await expectOk(character.share.$post({ param: { id } }));
      expect(shareToken).toEqual(expect.any(String));
      expect(await expectOk(character.$get({ param: { id } }))).toMatchObject({ shareToken });

      const shared = guestApi.api.shared.characters[":shareToken"];
      const sheet = await expectOk(shared.$get({ param: { shareToken: shareToken! } }));
      expect(sheet.id).toBe(id);
      expect(sheet.identity.background).not.toHaveProperty("privateNotes");

      const pdf = await shared.pdf.$get({ param: { shareToken: shareToken! } });
      expect(pdf.status).toBe(200);
      expect(pdf.headers.get("Content-Type")).toBe("application/pdf");
    });

    test("stops sharing once the token is revoked", async () => {
      const { id } = await createCharacter();
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
    const { id } = await createCharacter();
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
    for (const json of [
      { xp: 0 },
      { ...valid, alignment: "Invalid Alignment" },
      { ...valid, gender: "InvalidGender" },
    ]) {
      await expectStatus(characters.$post({ json: json as never }), 400);
    }
  });

  test("returns 404 for a missing character", async () => {
    const param = { id: NIL_UUID };
    await expectStatus(character.$get({ param }), 404);
    await expectStatus(character.$put({ param, json: { age: 30 } }), 404);
    await expectStatus(character.$delete({ param }), 404);
    await expectStatus(character.unarchive.$post({ param }), 404);
  });
});
