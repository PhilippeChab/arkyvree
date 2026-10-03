import { describe, expect, test } from "bun:test";

import { and, eq } from "drizzle-orm";

import { SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { charactersInCharacter, playerCharactersInCampaign } from "@/drizzle/schema.ts";
import { invalidateRuleset } from "@/server/cache/rulesetCache.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import {
  Activities,
  Attachments,
  Campaigns,
  CharacterAbilities,
  CharacterInventory,
  CharacterLanguages,
  CharacterLevelFeats,
  CharacterLevels,
  CharacterLevelSkills,
  Characters,
  Modifiers,
  PlayerCharacters,
  Players,
  Races,
  Requirements,
} from "@/server/repositories/index.ts";
import CharactersService from "@/server/services/CharactersService.ts";
import { cowEntity } from "@/server/services/rulesets/cow.ts";
import type { Session } from "@/shared/relations.ts";
import {
  addCharacterLevel,
  addRulesetContributor,
  createTestAttachment,
  createTestCampaign,
  createTestRuleset,
  createTestUser,
  findKlassLevel,
  getSeedCtx,
  invalidateSeededRuleset,
  makeSession,
  methodsOf,
  NIL_UUID,
  queuedPdfJobs,
  uniqueId,
} from "@/tests/helpers.ts";

const CharactersMethods = methodsOf(CharactersService);

type CharacterBody = Parameters<typeof CharactersMethods.createCharacter>[1];
const page = { limit: 100, page: 1 };

/** A new human of the seeded ruleset, unless `values` say otherwise. */
async function createCharacter(session: Session, values: Partial<CharacterBody> = {}) {
  const { rulesetId, raceMap } = await getSeedCtx();
  return CharactersMethods.createCharacter(session, {
    rulesetId,
    raceId: raceMap.pc["Human"],
    name: `Test Character ${uniqueId()}`,
    xp: 1000,
    alignment: "Lawful Good",
    abilities: {},
    age: 25,
    gender: "Male",
    height: "6'0\"",
    weight: "180 lbs",
    ...values,
  });
}

/** Another user's private ruleset, with a race. */
async function setupPrivateRuleset() {
  const { user: owner } = await createTestUser();
  const ruleset = await createTestRuleset(owner.id);
  const [race] = await Races.create(db, { name: "Private Race", rulesetId: ruleset.id, size: "Medium", baseSpeed: 30 });
  return { owner, ruleset, race };
}

async function fighterLevel() {
  const { klassMap } = await getSeedCtx();
  return (await findKlassLevel(klassMap.pc["Fighter"], 1))!;
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("CharactersService", () => {
  describe("creating a character", () => {
    test("stores its details, and a score of 10 for each ability not given", async () => {
      const { user, session } = await createTestUser();
      const { abilityMap } = await getSeedCtx();
      const details = {
        name: "Test Paladin",
        xp: 2000,
        alignment: "Lawful Good",
        age: 28,
        gender: "Female",
        height: "6'2\"",
        weight: "200 lbs",
        deity: "Bahamut",
        description: "A noble paladin",
        notes: "Sworn to protect",
      } as const;
      const scores = { [abilityMap["Strength"]]: 18, [abilityMap["Dexterity"]]: 14 };
      const paladin = await createCharacter(session, { ...details, abilities: scores });
      expect(paladin).toMatchObject({ ...details, userId: user.id });

      const abilities = Object.fromEntries(
        (await CharacterAbilities.findMany(db, { characterId: paladin.id })).map((a) => [a.abilityId, a.score]),
      );
      expect(Object.keys(abilities)).toHaveLength(6);
      expect(abilities).toMatchObject({ ...scores, [abilityMap["Wisdom"]]: 10 });

      expect(await createCharacter(session)).toMatchObject({ deity: null, description: null, notes: null });
    });

    test("has no limit on how many characters a user keeps", async () => {
      // There once was a limit of six.
      const { session } = await createTestUser();
      const first = await createCharacter(session);
      for (let i = 0; i < 6; i++) await createCharacter(session);
      await CharactersMethods.archiveCharacter(session, first.id);
      expect(await CharactersMethods.unarchiveCharacter(session, first.id)).toMatchObject({
        id: first.id,
        deletedAt: null,
      });
    });

    test("lets a private ruleset's campaign players and contributors in, and nobody else", async () => {
      const { owner, ruleset, race } = await setupPrivateRuleset();
      const onPrivate = { rulesetId: ruleset.id, raceId: race.id };

      const { user: player, session: playerSession } = await createTestUser();
      const [campaign] = await Campaigns.create(db, { name: "Test Campaign", rulesetId: ruleset.id });
      await Players.create(db, { userId: player.id, campaignId: campaign.id, role: "Player Character" });
      expect(await createCharacter(playerSession, onPrivate)).toMatchObject({ ...onPrivate, userId: player.id });

      const { user: contributor, session: contributorSession } = await createTestUser();
      await addRulesetContributor(ruleset.id, contributor, owner.id);
      expect(await createCharacter(contributorSession, onPrivate)).toMatchObject({
        ...onPrivate,
        userId: contributor.id,
      });

      const { session: stranger } = await createTestUser();
      await expect(createCharacter(stranger, onPrivate)).rejects.toThrow(ForbiddenError);
      await expect(createCharacter(stranger, { rulesetId: NIL_UUID })).rejects.toThrow(NotFoundError);
    });

    test("takes a race the ruleset inherits, however far up, and not one of an unrelated ruleset", async () => {
      const { user, session } = await createTestUser();
      const { owner, ruleset: grandparent, race } = await setupPrivateRuleset();
      // Forks of forks can't be made through the API, but the lineage check walks every ancestor.
      const parent = await createTestRuleset(owner.id, {
        rulesetId: grandparent.id,
        ancestorRulesetIds: [grandparent.id],
        status: "Published",
      });
      for (const fork of [
        await createTestRuleset(user.id, { rulesetId: grandparent.id, ancestorRulesetIds: [grandparent.id] }),
        await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id, grandparent.id] }),
      ]) {
        expect(await createCharacter(session, { rulesetId: fork.id, raceId: race.id })).toMatchObject({
          rulesetId: fork.id,
          raceId: race.id,
        });
      }

      const unrelated = await setupPrivateRuleset();
      const fork = await createTestRuleset(user.id, {
        rulesetId: grandparent.id,
        ancestorRulesetIds: [grandparent.id],
      });
      await expect(createCharacter(session, { rulesetId: fork.id, raceId: unrelated.race.id })).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  describe("reading and changing a character", () => {
    test("reads it built, changes only the fields sent, and refuses an edit from a stale copy", async () => {
      const { session } = await createTestUser();
      const created = await createCharacter(session, { deity: "Old Deity" });
      expect(await CharactersMethods.getCharacter(session, created.id)).toMatchObject({
        character: { id: created.id },
        detailedCharacter: expect.anything(),
      });

      const changes = {
        age: 35,
        xp: 5000,
        alignment: "Chaotic Good",
        description: "Updated",
        notes: "Updated notes",
      } as const;
      expect(await CharactersMethods.updateCharacter(session, created.id, changes)).toMatchObject({
        ...changes,
        id: created.id,
        deity: "Old Deity",
        name: created.name,
      });

      await expect(
        CharactersMethods.updateCharacter(session, created.id, { age: 40, updatedAt: created.updatedAt }),
      ).rejects.toThrow(ConflictError);
    });

    test("sets an ability through the id of a fork's copy of it", async () => {
      // Regression: scores were matched against the stored, pre-copy ability ids, so every save failed once the fork copied an ability.
      const ctx = await getSeedCtx();
      const session = makeSession(SEED_USER_ID);
      const fork = await createTestRuleset(SEED_USER_ID, {
        rulesetId: ctx.rulesetId,
        ancestorRulesetIds: [ctx.rulesetId],
      });
      const character = await createCharacter(session, { rulesetId: fork.id });
      const copy = (await cowEntity(db, "abilities", ctx.abilityMap["Strength"], fork.id, [], [])).id as string;
      invalidateRuleset(fork.id);

      await CharactersMethods.updateAbilities(session, character.id, { [copy]: 17 });
      const scores = await CharacterAbilities.findMany(db, { characterId: character.id });
      expect(scores.find((a) => a.abilityId === ctx.abilityMap["Strength"])?.score).toBe(17);
    });

    test("refuses a missing character, and another user's", async () => {
      const { session: owner } = await createTestUser();
      const { session: other } = await createTestUser();
      const character = await createCharacter(owner);
      await CharactersMethods.generateShareToken(owner, character.id);
      const calls = (s: Session, id: string) => [
        () => CharactersMethods.getCharacter(s, id),
        () => CharactersMethods.updateCharacter(s, id, { age: 40 }),
        () => CharactersMethods.enqueuePdf(s, id),
        () => CharactersMethods.archiveCharacter(s, id),
        () => CharactersMethods.generateShareToken(s, id),
        () => CharactersMethods.revokeShareToken(s, id),
      ];
      // One at a time: the test's transaction has a single connection.
      for (const call of [...calls(owner, NIL_UUID), ...calls(other, character.id)])
        await expect(call()).rejects.toThrow(NotFoundError);

      await CharactersMethods.archiveCharacter(owner, character.id);
      for (const call of [
        () => CharactersMethods.unarchiveCharacter(other, character.id),
        () => CharactersMethods.unarchiveCharacter(owner, NIL_UUID),
        () => CharactersMethods.hardDeleteCharacter(other, character.id),
      ]) {
        await expect(call()).rejects.toThrow(NotFoundError);
      }
    });
  });

  describe("listing a user's characters", () => {
    test("lists only theirs, with race and levels, searched and sorted", async () => {
      const { session } = await createTestUser();
      const { session: other } = await createTestUser();
      await createCharacter(other, { name: "Someone Else" });
      const list = async (where: Parameters<typeof CharactersMethods.getMyCharacters>[1] = {}) =>
        (await CharactersMethods.getMyCharacters(session, where, page)).items as {
          id: string;
          name: string;
          race?: unknown;
          levels?: unknown[];
        }[];
      expect(await list()).toEqual([]);

      const zephyr = await createCharacter(session, { name: "Zephyr Warrior" });
      await createCharacter(session, { name: "Aiden Mage" });
      await addCharacterLevel(zephyr.id, (await fighterLevel()).id);

      expect((await list()).find((c) => c.id === zephyr.id)).toMatchObject({
        race: expect.anything(),
        levels: [expect.anything()],
      });
      expect((await list({ search: "Zephyr" })).map((c) => c.name)).toEqual(["Zephyr Warrior"]);
      expect((await list({ orderBy: "name", orderDir: "asc" })).map((c) => c.name)).toEqual([
        "Aiden Mage",
        "Zephyr Warrior",
      ]);
      expect((await list({ orderBy: "name", orderDir: "desc" })).map((c) => c.name)).toEqual([
        "Zephyr Warrior",
        "Aiden Mage",
      ]);
    });

    test("lists the archived ones apart, or all together", async () => {
      const { session } = await createTestUser();
      const [active, archived] = [await createCharacter(session), await createCharacter(session)];
      await CharactersMethods.archiveCharacter(session, archived.id);
      const list = async (visibility: Visibility) =>
        ids((await CharactersMethods.getMyCharacters(session, { visibility }, page)).items as { id: string }[]).sort();

      expect(await list(Visibility.UnarchivedOnly)).toEqual([active.id]);
      expect(await list(Visibility.ArchivedOnly)).toEqual([archived.id]);
      expect(await list(Visibility.All)).toEqual([active.id, archived.id].sort());
    });

    test("lists those not in a campaign yet, a page at a time", async () => {
      const { session } = await createTestUser();
      const { campaign, player } = await createTestCampaign(session.userId);
      const linked = await createCharacter(session);
      await PlayerCharacters.create(db, { playerId: player.id, characterId: linked.id, visibility: "Public" });
      for (let i = 0; i < 15; i++) await createCharacter(session);

      const unlinked = (pageNumber: number) =>
        CharactersMethods.getUnlinkedCharacters(session, campaign.id, {}, { limit: 10, page: pageNumber });
      const [first, second] = [await unlinked(1), await unlinked(2)];
      expect(first).toMatchObject({ page: 1, nextPage: 2 });
      expect(first.items).toHaveLength(10);
      expect(second).toMatchObject({ page: 2, nextPage: undefined });
      expect(second.items).toHaveLength(5);
      const listed = [...ids(first.items), ...ids(second.items)];
      expect(new Set(listed).size).toBe(15);
      expect(listed).not.toContain(linked.id);
    });
  });

  describe("archiving", () => {
    test("hides the character and brings it back, its levels, picks, languages and inventory kept live", async () => {
      const { session } = await createTestUser();
      const ctx = await getSeedCtx();
      const character = await createCharacter(session);
      const level = await addCharacterLevel(character.id, (await fighterLevel()).id, {
        skills: [{ skillId: ctx.skillMap["Climb"], rank: 1 }],
        feats: [{ featId: ctx.featMap["Toughness"], aptitudeId: ctx.aptMap["General"] }],
      });
      await CharacterLanguages.create(db, { characterId: character.id, languageId: ctx.langMap["Common"] });
      await CharacterInventory.create(db, { characterId: character.id, itemId: ctx.itemMap["Longsword"], quantity: 1 });
      const children = async () => ({
        levels: (await CharacterLevels.findMany(db, { characterId: character.id })).length,
        skills: (await CharacterLevelSkills.findMany(db, { characterLevelIds: [level.id] })).length,
        feats: (await CharacterLevelFeats.findMany(db, { characterLevelIds: [level.id] })).length,
        languages: (await CharacterLanguages.findMany(db, { characterId: character.id })).filter((l) => !l.deletedAt)
          .length,
        inventory: (await CharacterInventory.findMany(db, { characterId: character.id })).filter((i) => !i.deletedAt)
          .length,
      });
      const all = { levels: 1, skills: 1, feats: 1, languages: 1, inventory: 1 };

      expect(await CharactersMethods.archiveCharacter(session, character.id)).toMatchObject({
        id: character.id,
        deletedAt: expect.any(String),
      });
      expect(await Characters.findOne(db, { id: character.id }, Visibility.ArchivedOnly)).toBeDefined();
      expect(await children()).toEqual(all);

      expect(await CharactersMethods.unarchiveCharacter(session, character.id)).toMatchObject({ deletedAt: null });
      expect(await children()).toEqual(all);
    });

    describe("deleting for good", () => {
      test("removes an archived character with its modifiers, attachments and bonded children", async () => {
        const { session } = await createTestUser();
        const { rulesetId, raceMap } = await getSeedCtx();
        const character = await createCharacter(session);
        await Modifiers.create(db, {
          sourceId: character.id,
          sourceType: "characters",
          target: "abilities.STR.score",
          value: "1",
          valueType: "number",
          operator: "add",
        });
        const [familiar] = await db
          .insert(charactersInCharacter)
          .values({
            userId: session.userId,
            rulesetId,
            raceId: raceMap.pc["Human"],
            parentCharacterId: character.id,
            kind: "familiar",
            xp: 0,
            name: "Whiskers",
            alignment: "True Neutral",
            gender: "Male",
          })
          .returning();

        const portraits = [
          await createTestAttachment("Character", character.id),
          await createTestAttachment("Character", familiar.id),
        ];

        await CharactersMethods.archiveCharacter(session, character.id);
        await CharactersMethods.hardDeleteCharacter(session, character.id);

        for (const id of [character.id, familiar.id])
          expect(await Characters.findOne(db, { id }, Visibility.All)).toBeUndefined();
        expect(await Modifiers.findManyBySource(db, { sourceIds: [character.id], sourceType: "characters" })).toEqual(
          [],
        );
        for (const { id } of portraits) expect(await Attachments.findOne(db, { id })).toBeUndefined();
      });

      test("is refused for a character that isn't archived, or that plays in an active campaign", async () => {
        const { session } = await createTestUser();
        const character = await createCharacter(session);
        await expect(CharactersMethods.hardDeleteCharacter(session, character.id)).rejects.toThrow(NotFoundError);

        const { player } = await createTestCampaign(session.userId);
        await PlayerCharacters.create(db, { playerId: player.id, characterId: character.id });
        await CharactersMethods.archiveCharacter(session, character.id);
        await expect(CharactersMethods.hardDeleteCharacter(session, character.id)).rejects.toThrow(ConflictError);
      });

      test.each(["removed from the campaign", "in an archived campaign"])(
        "goes through for a character %s",
        async (situation) => {
          const { session } = await createTestUser();
          const character = await createCharacter(session);
          const { campaign, player } = await createTestCampaign(session.userId);
          await PlayerCharacters.create(db, { playerId: player.id, characterId: character.id });
          if (situation === "removed from the campaign")
            await db
              .update(playerCharactersInCampaign)
              .set({ deletedAt: new Date().toISOString() })
              .where(
                and(
                  eq(playerCharactersInCampaign.playerId, player.id),
                  eq(playerCharactersInCampaign.characterId, character.id),
                ),
              );
          else await Campaigns.archive(db, { id: campaign.id });

          await CharactersMethods.archiveCharacter(session, character.id);
          await CharactersMethods.hardDeleteCharacter(session, character.id);
          expect(await Characters.findOne(db, { id: character.id }, Visibility.All)).toBeUndefined();
        },
      );
    });
  });

  test("queues the character's PDF on the user's queue, and logs it", async () => {
    const { session } = await createTestUser();
    const character = await createCharacter(session);
    await CharactersMethods.enqueuePdf(session, character.id);

    expect(await queuedPdfJobs(character.id)).toEqual([
      {
        task: "generatePdf",
        queue: `pdf-${session.userId}`,
        payload: expect.objectContaining({
          userId: session.userId,
          characterId: character.id,
          characterName: character.name,
        }),
      },
    ]);
    const { items } = await Activities.findMany(db, { userId: session.userId, type: "generatePdf" }, page);
    expect(items.map((a) => a.targetId)).toEqual([character.id]);
  });

  describe("sharing", () => {
    test("gives anyone with the token the built character and its PDF, until it's replaced or revoked", async () => {
      const { session } = await createTestUser();
      const character = await createCharacter(session);
      const first = (await CharactersMethods.generateShareToken(session, character.id)).shareToken!;
      expect(await CharactersMethods.getSharedCharacter(first)).toMatchObject({
        character: { id: character.id },
        detailedCharacter: expect.anything(),
      });
      expect(await CharactersMethods.generateSharedPdf(first)).toMatchObject({
        detailedCharacter: expect.anything(),
        CharacterSheetComponent: expect.anything(),
      });

      const second = (await CharactersMethods.generateShareToken(session, character.id)).shareToken!;
      expect(second).not.toBe(first);
      expect(await CharactersMethods.revokeShareToken(session, character.id)).toMatchObject({ shareToken: null });
      // Revoking what isn't shared is fine.
      expect(await CharactersMethods.revokeShareToken(session, character.id)).toMatchObject({ shareToken: null });

      for (const token of [first, second, NIL_UUID])
        await expect(CharactersMethods.getSharedCharacter(token)).rejects.toThrow(NotFoundError);
      await expect(CharactersMethods.generateSharedPdf(NIL_UUID)).rejects.toThrow(NotFoundError);
    });
  });

  describe("races a new character can take", () => {
    test("are all eligible on the seeded ruleset", async () => {
      const { rulesetId } = await getSeedCtx();
      const { items, page: pageNumber } = await CharactersMethods.getAvailableRaces(rulesetId, {}, {}, page);
      expect(pageNumber).toBe(1);
      expect(items.map((r) => r.name)).toEqual(expect.arrayContaining(["Human", "Elf", "Dwarf"]));
      expect(items.filter((r) => !r.eligible)).toEqual([]);
    });

    test.each([
      ["alignment", "identity.beliefs.alignment", "Chaotic Evil", "Lawful Good"],
      ["gender", "identity.physiology.gender", "Female", "Male"],
    ] as const)("follow a race's %s requirement, once the form gives one", async (field, target, allowed, other) => {
      const { rulesetId } = await getSeedCtx();
      const [race] = await Races.create(db, {
        name: `Restricted Race ${uniqueId()}`,
        rulesetId,
        size: "Medium",
        baseSpeed: 30,
      });
      await Requirements.create(db, {
        entityId: race.id,
        entityType: "races",
        level: "1",
        target,
        operator: "equal",
        value: allowed,
        valueType: "string",
      });
      invalidateSeededRuleset(rulesetId);
      const eligible = async (form: object) =>
        (await CharactersMethods.getAvailableRaces(rulesetId, form, {}, page)).items.find((r) => r.id === race.id)!
          .eligible;

      expect(await eligible({ [field]: allowed })).toBe(true);
      expect(await eligible({ [field]: other })).toBe(false);
      // Nothing to judge by yet.
      expect(await eligible({})).toBe(true);
    });
  });
});
