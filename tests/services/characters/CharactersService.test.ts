import { describe, expect, test } from "bun:test";

import { and, eq } from "drizzle-orm";
import { isValidElement } from "react";

import { charactersInCharacter, playerCharactersInCampaign } from "@/drizzle/schema.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews } from "@/server/cow/index.ts";
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
import { CharactersService } from "@/server/services/characters/index.ts";
import { CharacterSharingService } from "@/server/services/characters/sharing/index.ts";
import type { Session } from "@/shared/relations.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { backdateLastChange, createCharacterAs } from "@/tests/support/characters.ts";
import { addRulesetContributor } from "@/tests/support/contributors.ts";
import { createTestAttachment } from "@/tests/support/files.ts";
import { queuedPdfJobs } from "@/tests/support/jobs.ts";
import { addCharacterLevel, findKlassLevel } from "@/tests/support/levels.ts";
import {
  copyEntity,
  createSeededTestRuleset,
  createTestRuleset,
  invalidateSeededRuleset,
} from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser, makeSession } from "@/tests/support/users.ts";

const page = { limit: 100, page: 1 };

function ids(rows: { id: string }[]) {
  return rows.map((r) => r.id);
}

async function fighterLevel() {
  const { klassMap } = await getSeedCtx();
  return (await findKlassLevel(klassMap.pc["Fighter"], 1))!;
}

/** Another user's private ruleset, with a race. */
async function setupPrivateRuleset() {
  const { user: owner } = await createTestUser();
  const ruleset = await createTestRuleset(owner.id);
  const [race] = await Races.create(db, { name: "Private Race", rulesetId: ruleset.id, size: "Medium", baseSpeed: 30 });
  return { owner, ruleset, race };
}

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
      const paladin = await createCharacterAs(session, { ...details, abilities: scores });
      expect(paladin).toMatchObject({ ...details, userId: user.id });

      const abilities = Object.fromEntries(
        (await CharacterAbilities.findMany(db, { characterId: paladin.id })).map((a) => [a.abilityId, a.score]),
      );
      expect(Object.keys(abilities)).toHaveLength(6);
      expect(abilities).toMatchObject({ ...scores, [abilityMap["Wisdom"]]: 10 });

      expect(await createCharacterAs(session)).toMatchObject({ deity: null, description: null, notes: null });
    });

    test("has no limit on how many characters a user keeps", async () => {
      // There once was a limit of six.
      const { session } = await createTestUser();
      const first = await createCharacterAs(session);
      for (let i = 0; i < 6; i++) await createCharacterAs(session);
      await CharactersService.archiveCharacter(session, first.id);
      expect(await CharactersService.unarchiveCharacter(session, first.id)).toMatchObject({
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
      expect(await createCharacterAs(playerSession, onPrivate)).toMatchObject({ ...onPrivate, userId: player.id });

      const { user: contributor, session: contributorSession } = await createTestUser();
      await addRulesetContributor(ruleset.id, contributor, owner.id);
      expect(await createCharacterAs(contributorSession, onPrivate)).toMatchObject({
        ...onPrivate,
        userId: contributor.id,
      });

      const { session: stranger } = await createTestUser();
      expect(createCharacterAs(stranger, onPrivate)).rejects.toThrow(ForbiddenError);
      expect(createCharacterAs(stranger, { rulesetId: NIL_UUID })).rejects.toThrow(NotFoundError);
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
        expect(await createCharacterAs(session, { rulesetId: fork.id, raceId: race.id })).toMatchObject({
          rulesetId: fork.id,
          raceId: race.id,
        });
      }

      const unrelated = await setupPrivateRuleset();
      const fork = await createTestRuleset(user.id, {
        rulesetId: grandparent.id,
        ancestorRulesetIds: [grandparent.id],
      });
      expect(createCharacterAs(session, { rulesetId: fork.id, raceId: unrelated.race.id })).rejects.toMatchObject({
        message: `Race ${unrelated.race.id} does not belong to the character's ruleset`,
        refusal: "invalid",
      });
    });

    test("takes its race and scores by the ids of what its fork copied, as the copies, and refuses one it lacks by name", async () => {
      const ctx = await getSeedCtx();
      const session = makeSession();
      const fork = await createSeededTestRuleset(SEED_USER_ID);
      const elf = await copyEntity(db, "races", ctx.raceMap.pc["Elf"], fork);
      const strength = await copyEntity(db, "abilities", ctx.abilityMap["Strength"], fork);
      RulesetViews.invalidate(fork.id);

      // The seed's ids are the sources': the API takes them, as it takes the copies' the client sends
      const values = {
        rulesetId: fork.id,
        raceId: ctx.raceMap.pc["Elf"],
        abilities: { [ctx.abilityMap["Strength"]]: 17 },
      };
      const character = await createCharacterAs(session, values);
      expect(character.raceId).toBe(elf.id);
      const scores = await CharacterAbilities.findMany(db, { characterId: character.id });
      expect(scores.map(({ abilityId }) => abilityId)).not.toContain(ctx.abilityMap["Strength"]);
      expect(scores.find(({ abilityId }) => abilityId === strength.id)?.score).toBe(17);

      const twice = { [ctx.abilityMap["Strength"]]: 17, [strength.id]: 12 };
      expect(createCharacterAs(session, { ...values, abilities: twice })).rejects.toMatchObject({
        message: `Ability ${strength.id} is given more than once`,
        refusal: "invalid",
      });
      const lacking = (kind: string) => ({
        message: `${kind} ${NIL_UUID} does not belong to the character's ruleset`,
        refusal: "invalid",
      });
      expect(createCharacterAs(session, { ...values, raceId: NIL_UUID })).rejects.toMatchObject(lacking("Race"));
      expect(createCharacterAs(session, { ...values, abilities: { [NIL_UUID]: 12 } })).rejects.toMatchObject(
        lacking("Ability"),
      );
    });
  });

  describe("reading and changing a character", () => {
    test("reads it built, changes only the fields sent, and refuses an edit from a stale copy", async () => {
      const { session } = await createTestUser();
      const created = await createCharacterAs(session, { deity: "Old Deity" });
      const sheet = await CharactersService.getCharacter(session, created.id);
      expect(sheet).toMatchObject({ id: created.id, name: created.name });
      // Built: its combat, not only who it is
      expect(Object.keys(sheet.combat)).not.toHaveLength(0);

      const changes = {
        age: 35,
        xp: 5000,
        alignment: "Chaotic Good",
        description: "Updated",
        notes: "Updated notes",
      } as const;
      expect(await CharactersService.updateCharacter(session, created.id, changes)).toMatchObject({
        ...changes,
        id: created.id,
        deity: "Old Deity",
        name: created.name,
      });

      expect(
        CharactersService.updateCharacter(session, created.id, { age: 40, updatedAt: created.updatedAt }),
      ).rejects.toThrow(ConflictError);
    });

    test("sets an ability through the id of a fork's copy of it", async () => {
      // Regression: scores were matched against the stored, pre-copy ability ids, so every save failed once the fork copied an ability.
      const ctx = await getSeedCtx();
      const session = makeSession();
      const fork = await createTestRuleset(SEED_USER_ID, {
        rulesetId: ctx.rulesetId,
        ancestorRulesetIds: [ctx.rulesetId],
      });
      const character = await createCharacterAs(session, { rulesetId: fork.id });
      const copy = (await copyEntity(db, "abilities", ctx.abilityMap["Strength"], fork)).id as string;
      RulesetViews.invalidate(fork.id);

      await CharactersService.updateAbilities(session, character.id, { [copy]: 17 });
      const scores = await CharacterAbilities.findMany(db, { characterId: character.id });
      expect(scores.find((a) => a.abilityId === ctx.abilityMap["Strength"])?.score).toBe(17);
    });

    test("sets a score by either id of an ability its fork copied, and refuses one it lacks by name", async () => {
      const ctx = await getSeedCtx();
      const session = makeSession();
      const fork = await createSeededTestRuleset(SEED_USER_ID);
      const character = await createCharacterAs(session, { rulesetId: fork.id });
      const strength = await copyEntity(db, "abilities", ctx.abilityMap["Strength"], fork);
      RulesetViews.invalidate(fork.id);

      await CharactersService.updateAbilities(session, character.id, { [ctx.abilityMap["Strength"]]: 15 });
      const scores = await CharacterAbilities.findMany(db, { characterId: character.id });
      expect(scores.find(({ abilityId }) => abilityId === ctx.abilityMap["Strength"])?.score).toBe(15);

      const twice = { [ctx.abilityMap["Strength"]]: 15, [strength.id]: 16 };
      expect(CharactersService.updateAbilities(session, character.id, twice)).rejects.toMatchObject({
        message: `Ability ${strength.id} is given more than once`,
        refusal: "invalid",
      });
      expect(CharactersService.updateAbilities(session, character.id, { [NIL_UUID]: 15 })).rejects.toMatchObject({
        message: `Ability ${NIL_UUID} does not belong to the character's ruleset`,
        refusal: "invalid",
      });
    });

    test("sets a language by the id of what its fork copied, as the copy, and refuses one sent twice or lacking by name", async () => {
      const ctx = await getSeedCtx();
      const session = makeSession();
      const fork = await createSeededTestRuleset(SEED_USER_ID);
      const draconic = await copyEntity(db, "languages", ctx.langMap["Draconic"], fork);
      RulesetViews.invalidate(fork.id);
      const character = await createCharacterAs(session, { rulesetId: fork.id });
      const spoken = async () =>
        (await CharacterLanguages.findMany(db, { characterId: character.id })).map(({ languageId }) => languageId);

      await CharactersService.updateLanguages(session, character.id, [ctx.langMap["Draconic"]]);
      expect(await spoken()).toEqual([draconic.id]);
      const languageIds = [ctx.langMap["Common"], ctx.langMap["Draconic"]];
      await CharactersService.updateCharacter(session, character.id, { languageIds });
      expect((await spoken()).toSorted()).toEqual([ctx.langMap["Common"], draconic.id].toSorted());

      // Its source's id and its copy's name one language
      const both = [ctx.langMap["Draconic"], draconic.id];
      expect(CharactersService.updateLanguages(session, character.id, both)).rejects.toMatchObject({
        message: `Language ${draconic.id} is given more than once`,
        refusal: "invalid",
      });
      expect(CharactersService.updateLanguages(session, character.id, [NIL_UUID])).rejects.toMatchObject({
        message: `Language ${NIL_UUID} does not belong to the character's ruleset`,
        refusal: "invalid",
      });
    });

    test("refuses a missing character, and another user's", async () => {
      const { session: owner } = await createTestUser();
      const { session: other } = await createTestUser();
      const character = await createCharacterAs(owner);
      await CharacterSharingService.generateShareToken(owner, character.id);
      const calls = (s: Session, id: string) => [
        () => CharactersService.getCharacter(s, id),
        () => CharactersService.updateCharacter(s, id, { age: 40 }),
        () => CharactersService.enqueuePdf(s, id),
        () => CharactersService.archiveCharacter(s, id),
        () => CharacterSharingService.generateShareToken(s, id),
        () => CharacterSharingService.revokeShareToken(s, id),
      ];
      // One at a time: the test's transaction has a single connection.
      for (const call of [...calls(owner, NIL_UUID), ...calls(other, character.id)])
        expect(call()).rejects.toThrow(NotFoundError);

      await CharactersService.archiveCharacter(owner, character.id);
      for (const call of [
        () => CharactersService.unarchiveCharacter(other, character.id),
        () => CharactersService.unarchiveCharacter(owner, NIL_UUID),
        () => CharactersService.hardDeleteCharacter(other, character.id),
      ])
        expect(call()).rejects.toThrow(NotFoundError);
    });
  });

  describe("listing a user's characters", () => {
    test("lists only theirs, with race and levels, searched and sorted", async () => {
      const { session } = await createTestUser();
      const { session: other } = await createTestUser();
      await createCharacterAs(other, { name: "Someone Else" });
      const list = async (where: Parameters<typeof CharactersService.getCharacters>[1] = {}) =>
        (await CharactersService.getCharacters(session, where, page)).items as {
          id: string;
          levels?: unknown[];
          name: string;
          race?: unknown;
        }[];
      expect(await list()).toEqual([]);

      const zephyr = await createCharacterAs(session, { name: "Zephyr Warrior" });
      await createCharacterAs(session, { name: "Aiden Mage" });
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

    test("lists the last changed first, a level-up as much as an edit, unless told another order", async () => {
      const { session } = await createTestUser();
      const ids = async (where: Parameters<typeof CharactersService.getCharacters>[1] = {}) =>
        ((await CharactersService.getCharacters(session, where, page)).items as { id: string }[]).map((c) => c.id);
      const leveled = await createCharacterAs(session, { name: "Leveled Later" });
      const untouched = await createCharacterAs(session, { name: "Made Later" });
      await backdateLastChange(leveled.id, "2000-01-01T00:00:00Z");
      await backdateLastChange(untouched.id, "2001-01-01T00:00:00Z");
      expect(await ids()).toEqual([untouched.id, leveled.id]);

      // A level writes the character's levels, never its own row
      await addCharacterLevel(leveled.id, (await fighterLevel()).id);

      expect(await ids()).toEqual([leveled.id, untouched.id]);
      expect(await ids({ orderBy: "lastChangedAt", orderDir: "asc" })).toEqual([untouched.id, leveled.id]);
      expect(await ids({ orderBy: "name", orderDir: "desc" })).toEqual([untouched.id, leveled.id]);
    });

    test("lists the archived ones apart, or all together", async () => {
      const { session } = await createTestUser();
      const [active, archived] = [await createCharacterAs(session), await createCharacterAs(session)];
      await CharactersService.archiveCharacter(session, archived.id);
      const list = async (visibility: "active" | "archived" | "all") =>
        ids((await CharactersService.getCharacters(session, { visibility }, page)).items as { id: string }[]).sort();

      expect(await list("active")).toEqual([active.id]);
      expect(await list("archived")).toEqual([archived.id]);
      expect(await list("all")).toEqual([active.id, archived.id].sort());
    });

    test("lists those not in a campaign yet, a page at a time", async () => {
      const { session } = await createTestUser();
      const { campaign, player } = await createTestCampaign(session.userId);
      const linked = await createCharacterAs(session);
      await PlayerCharacters.create(db, { playerId: player.id, characterId: linked.id, visibility: "Public" });
      for (let i = 0; i < 15; i++) await createCharacterAs(session);

      const unlinked = (pageNumber: number) =>
        CharactersService.getUnlinkedCharacters(session, campaign.id, {}, { limit: 10, page: pageNumber });
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
      const character = await createCharacterAs(session);
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

      expect(await CharactersService.archiveCharacter(session, character.id)).toMatchObject({
        id: character.id,
        deletedAt: expect.any(String),
      });
      expect(await Characters.findOne(db, { id: character.id }, Visibility.ArchivedOnly)).toBeDefined();
      expect(await children()).toEqual(all);

      expect(await CharactersService.unarchiveCharacter(session, character.id)).toMatchObject({ deletedAt: null });
      expect(await children()).toEqual(all);
    });

    describe("deleting for good", () => {
      test("removes an archived character with its modifiers, attachments and bonded children", async () => {
        const { session } = await createTestUser();
        const { rulesetId, raceMap } = await getSeedCtx();
        const character = await createCharacterAs(session);
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
          await createTestAttachment("portrait", character.id),
          await createTestAttachment("portrait", familiar.id),
        ];

        await CharactersService.archiveCharacter(session, character.id);
        await CharactersService.hardDeleteCharacter(session, character.id);

        for (const id of [character.id, familiar.id])
          expect(await Characters.findOne(db, { id }, Visibility.All)).toBeUndefined();
        expect(await Modifiers.findMany(db, { sourceIds: [character.id], sourceType: "characters" })).toEqual([]);
        for (const { id } of portraits) expect(await Attachments.findOne(db, { id })).toBeUndefined();
      });

      test("is refused for a character that isn't archived, or that plays in an active campaign", async () => {
        const { session } = await createTestUser();
        const character = await createCharacterAs(session);
        expect(CharactersService.hardDeleteCharacter(session, character.id)).rejects.toThrow(NotFoundError);

        const { player } = await createTestCampaign(session.userId);
        await PlayerCharacters.create(db, { playerId: player.id, characterId: character.id });
        await CharactersService.archiveCharacter(session, character.id);
        expect(CharactersService.hardDeleteCharacter(session, character.id)).rejects.toThrow(ConflictError);
      });

      test.each(["removed from the campaign", "in an archived campaign"])(
        "goes through for a character %s",
        async (situation) => {
          const { session } = await createTestUser();
          const character = await createCharacterAs(session);
          const { campaign, player } = await createTestCampaign(session.userId);
          await PlayerCharacters.create(db, { playerId: player.id, characterId: character.id });
          if (situation === "removed from the campaign") {
            await db
              .update(playerCharactersInCampaign)
              .set({ deletedAt: new Date().toISOString() })
              .where(
                and(
                  eq(playerCharactersInCampaign.playerId, player.id),
                  eq(playerCharactersInCampaign.characterId, character.id),
                ),
              );
          } else {
            await Campaigns.archive(db, { id: campaign.id });
          }

          await CharactersService.archiveCharacter(session, character.id);
          await CharactersService.hardDeleteCharacter(session, character.id);
          expect(await Characters.findOne(db, { id: character.id }, Visibility.All)).toBeUndefined();
        },
      );
    });
  });

  test("queues the character's PDF on the user's queue, and logs it", async () => {
    const { session } = await createTestUser();
    const character = await createCharacterAs(session);
    await CharactersService.enqueuePdf(session, character.id);

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
    const { items } = await Activities.findPage(db, { userId: session.userId, type: "generatePdf" }, page);
    expect(items.map((a) => a.targetId)).toEqual([character.id]);
  });

  describe("sharing", () => {
    test("gives anyone with the token the built character and its PDF, until it's replaced or revoked", async () => {
      const { session } = await createTestUser();
      const character = await createCharacterAs(session);
      const first = (await CharacterSharingService.generateShareToken(session, character.id)).shareToken!;
      const shared = await CharacterSharingService.getSharedCharacter(first);
      expect(shared).toMatchObject({ id: character.id, name: character.name });
      expect(Object.keys(shared.combat)).not.toHaveLength(0);
      // The printed sheet: the document the route renders
      expect(isValidElement(await CharacterSharingService.generateSharedPdf(first))).toBe(true);

      const second = (await CharacterSharingService.generateShareToken(session, character.id)).shareToken!;
      expect(second).not.toBe(first);
      expect(await CharacterSharingService.revokeShareToken(session, character.id)).toMatchObject({ shareToken: null });
      // Revoking what isn't shared is fine.
      expect(await CharacterSharingService.revokeShareToken(session, character.id)).toMatchObject({ shareToken: null });

      for (const token of [first, second, NIL_UUID])
        expect(CharacterSharingService.getSharedCharacter(token)).rejects.toThrow(NotFoundError);
      expect(CharacterSharingService.generateSharedPdf(NIL_UUID)).rejects.toThrow(NotFoundError);
    });
  });

  describe("races a new character can take", () => {
    test("are all eligible on the seeded ruleset", async () => {
      const { rulesetId } = await getSeedCtx();
      const { items, page: pageNumber } = await CharactersService.getAvailableRaces(rulesetId, {}, {}, page);
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
        (await CharactersService.getAvailableRaces(rulesetId, form, {}, page)).items.find((r) => r.id === race.id)!
          .eligible;

      expect(await eligible({ [field]: allowed })).toBe(true);
      expect(await eligible({ [field]: other })).toBe(false);
      // Nothing to judge by yet.
      expect(await eligible({})).toBe(true);
    });

    test("count what the form doesn't say as met inside an or, as alone", async () => {
      const { rulesetId } = await getSeedCtx();
      const [race] = await Races.create(db, {
        name: `Restricted Race ${uniqueId()}`,
        rulesetId,
        size: "Medium",
        baseSpeed: 30,
      });
      const owner = { entityId: race.id, entityType: "races", operator: "equal", valueType: "string" } as const;
      await Requirements.createMany(db, [
        { entityId: race.id, entityType: "races", level: "1", chainingOperator: "or" },
        { ...owner, level: "1.1", target: "identity.beliefs.alignment", value: "Lawful Good" },
        { ...owner, level: "1.2", target: "identity.physiology.gender", value: "Male" },
      ]);
      invalidateSeededRuleset(rulesetId);
      const eligible = async (form: object) =>
        (await CharactersService.getAvailableRaces(rulesetId, form, {}, page)).items.find((r) => r.id === race.id)!
          .eligible;

      expect(await eligible({})).toBe(true);
      // The alignment it doesn't say may meet the group, whatever the gender
      expect(await eligible({ gender: "Female" })).toBe(true);
      expect(await eligible({ alignment: "Lawful Good", gender: "Female" })).toBe(true);
      expect(await eligible({ alignment: "Chaotic Evil", gender: "Male" })).toBe(true);
      expect(await eligible({ alignment: "Chaotic Evil", gender: "Female" })).toBe(false);
    });
  });
});
