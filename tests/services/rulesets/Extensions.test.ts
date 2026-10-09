import { describe, expect, test } from "bun:test";

import type { InferInsertModel } from "drizzle-orm";

import {
  DND35_COMPLETE_ADVENTURER_NAME,
  DND35_COMPLETE_ARCANE_NAME,
  DND35_COMPLETE_DIVINE_NAME,
  DND35_COMPLETE_WARRIOR_NAME,
  DND35_DMG_NAME,
} from "@/content/dnd3.5/names.ts";
import { characterAbilitiesInCharacter, type rulesetsInRules } from "@/drizzle/schema.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import { EntityEdit, RulesetViews } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { fetchEveryPage } from "@/server/repositories/concerns/Paginates.ts";
import {
  Abilities,
  Aptitudes,
  Characters,
  EntitySnapshots,
  Feats,
  FeatsAptitudes,
  Items,
  Klasses,
  KlassLevelFeats,
  KlassLevelPowers,
  KlassLevels,
  KlassSkills,
  Languages,
  Mechanics,
  Modifiers,
  Powers,
  PowersAptitudes,
  Races,
  Requirements,
  RulesetExtensions,
  Rulesets,
  Saves,
  Skills,
} from "@/server/repositories/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";
import type { Session } from "@/shared/relations.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { buildAs, createTestCharacter } from "@/tests/support/characters.ts";
import { addCharacterLevel, createTestKlassLevel, pickFeat } from "@/tests/support/levels.ts";
import {
  copyEntity,
  createSeededTestRulesetWithExtensions,
  createTestRuleset,
  editRuleset,
  invalidateSeededRuleset,
} from "@/tests/support/rulesets.ts";
import { findSeededRuleset, getSeedCtx, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

type EntityType = "feats" | "powers";

type RulesetValues = Partial<InferInsertModel<typeof rulesetsInRules>>;
const firstPage = { limit: 50, page: 1 };
const ENTITIES = {
  feats: {
    name: "Toughness",
    links: (id: string) => FeatsAptitudes.findMany(db, { featId: id }),
    link: (id: string, aptitudeId: string) => FeatsAptitudes.create(db, { featId: id, aptitudeId }),
    get: async (rulesetId: string, id: string) => {
      const { featsAptitudesInRules, ...rest } = await FeatsService.getFeat(rulesetId, id);
      return { ...rest, links: featsAptitudesInRules };
    },
    list: async (rulesetId: string, search: string) =>
      (await FeatsService.getFeats(rulesetId, { search }, firstPage)).items.map(
        ({ featsAptitudesInRules, ...rest }) => ({ ...rest, links: featsAptitudesInRules }),
      ),
    edit: (session: Session, rulesetId: string, id: string) =>
      FeatsService.updateFeat(session, rulesetId, id, { name: "Toughness", description: "Mine" }),
  },
  powers: {
    name: "Cure Light Wounds",
    links: (id: string) => PowersAptitudes.findMany(db, { powerId: id }),
    link: (id: string, aptitudeId: string) => PowersAptitudes.create(db, { powerId: id, aptitudeId, level: 1 }),
    get: async (rulesetId: string, id: string) => {
      const { powersAptitudesInRules, ...rest } = await PowersService.getPower(rulesetId, id);
      return { ...rest, links: powersAptitudesInRules };
    },
    list: async (rulesetId: string, search: string) =>
      (await PowersService.getPowers(rulesetId, { search }, firstPage)).items.map(
        ({ powersAptitudesInRules, ...rest }) => ({ ...rest, links: powersAptitudesInRules }),
      ),
    edit: (session: Session, rulesetId: string, id: string) =>
      PowersService.updatePower(session, rulesetId, id, { name: "Cure Light Wounds", description: "Mine" }),
  },
};

function unique(keys: string[]) {
  return new Set(keys).size === keys.length;
}

/** A published public extension of the seeded base (a system one when `userId` is null). */
async function createExtension(userId: string | null = null, values: RulesetValues = {}) {
  const { rulesetId } = await getSeedCtx();
  return await createTestRuleset(userId, {
    rulesetId,
    ancestorRulesetIds: [rulesetId],
    kind: "extension",
    status: "Published",
    private: false,
    ...values,
  });
}

/**
 * A favored soul's first level on a fork taking the DMG, Complete Warrior and Complete Divine, in that order: the
 * favored soul's list, as its level-up offers it, composes as Complete Warrior's copy.
 */
async function favoredSoulOnMixedFork() {
  const fork = await forkTaking(DND35_DMG_NAME, DND35_COMPLETE_WARRIOR_NAME, DND35_COMPLETE_DIVINE_NAME);
  const divine = await findSeededRuleset(DND35_COMPLETE_DIVINE_NAME);
  const favoredSoul = (await Klasses.findOne(db, { name: "Favored Soul", rulesetId: divine.id }))!;
  const { aptitudePools } = await CharacterLevelsService.getPowerStep(
    fork.session,
    fork.character.id,
    favoredSoul.id,
    1,
  );
  const list = Object.values(aptitudePools).find((pool) => pool.name === "Favored Soul Spells")!;
  const offer = (where: { powerLevel?: number; search: string }) =>
    CharacterLevelsService.getAvailablePowers(
      fork.session,
      fork.character.id,
      { aptitudeId: list.id, classId: favoredSoul.id, level: 1, ...where },
      firstPage,
    );
  return { ...fork, favoredSoul, list, offer };
}

/** The fork's visible feats of this name. */
async function featsNamed(rulesetId: string, name: string) {
  return (await FeatsService.getFeats(rulesetId, { search: name }, firstPage)).items.filter((f) => f.name === name);
}

async function forkBase(session: Session, values: { private?: boolean } = {}) {
  const { rulesetId } = await getSeedCtx();
  return await RulesetsService.forkRuleset(session, rulesetId, {
    name: `Fork ${uniqueId()}`,
    private: false,
    ...values,
  });
}

/** A new user's fork of the base taking these books, in this order, and a character of theirs on it. */
async function forkTaking(...books: string[]) {
  const { user, session, draft } = await setupFork();
  for (const book of books)
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [(await findSeededRuleset(book)).id]);

  const { abilityMap } = await getSeedCtx();
  const character = await createTestCharacter(user.id, { rulesetId: draft.id });
  await db
    .insert(characterAbilitiesInCharacter)
    .values(Object.values(abilityMap).map((abilityId) => ({ characterId: character.id, abilityId, score: 16 })));
  return { session, draft, character };
}

/** The seeded base, its Complete Warrior extension, and a new user's fork of the base. */
async function setupFork() {
  const { user, session } = await createTestUser();
  const { rulesetId } = await getSeedCtx();
  const base = (await Rulesets.findOne(db, { id: rulesetId }))!;
  const extension = await findSeededRuleset(DND35_COMPLETE_WARRIOR_NAME);
  const draft = await forkBase(session);
  return { user, session, base, extension, draft };
}

/** Two system extensions that each copy the base entity and give it an aptitude, a requirement and a modifier; and a fork using both. */
async function setupSiblings(entityType: EntityType) {
  const entity = ENTITIES[entityType];
  const { session } = await createTestUser();
  const { featMap, powerMap } = await getSeedCtx();
  const baseId = entityType === "feats" ? featMap[entity.name] : powerMap[entity.name];
  const contributions = [];
  const extensions = [];
  for (const ability of ["strength", "wisdom"]) {
    const extension = await createExtension();
    const copyId = (await copyEntity(db, entityType, baseId, extension)).id as string;
    const [aptitude] = await Aptitudes.create(db, {
      name: `${ability} aptitude ${uniqueId()}`,
      rulesetId: extension.id,
    });
    await entity.link(copyId, aptitude.id);
    await Requirements.create(db, {
      entityId: copyId,
      entityType,
      level: "9",
      target: `abilities.${ability}.total`,
      value: "13",
      valueType: "number",
      operator: "greater_than_or_equal",
    });
    await Modifiers.create(db, {
      sourceId: copyId,
      sourceType: entityType,
      target: `abilities.${ability}.misc`,
      value: "1",
      valueType: "number",
      operator: "add",
    });
    contributions.push({
      copyId,
      aptitudeId: aptitude.id,
      requirement: `abilities.${ability}.total`,
      modifier: `abilities.${ability}.misc`,
    });
    extensions.push(extension.id);
  }
  const draft = await forkBase(session);
  await RulesetExtensionsService.subscribeExtension(session, draft.id, extensions);
  return { session, draft, baseId, contributions };
}

/** A seeded Complete Warrior feat, with the aptitude it's picked through. */
async function warriorFeat(name: string) {
  const extension = await findSeededRuleset(DND35_COMPLETE_WARRIOR_NAME);
  const feat = (await Feats.findOne(db, { name, rulesetId: extension.id }))!;
  const [link] = await FeatsAptitudes.findMany(db, { featId: feat.id });
  return { ...feat, aptitudeId: link.aptitudeId };
}

describe("subscribing to an extension", () => {
  test("adds its content to the fork without copying it, and records the subscription", async () => {
    const { session, extension, draft } = await setupFork();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);

    expect((await Rulesets.findOne(db, { id: draft.id }))!.extensionRulesetIds).toEqual([extension.id]);
    const trooper = await warriorFeat("Shock Trooper");
    expect(await FeatsService.getFeat(draft.id, trooper.id)).toMatchObject({
      id: trooper.id,
      rulesetId: extension.id,
    });
    expect(await RulesetExtensions.findMany(db, { rulesetId: draft.id })).toMatchObject([
      { extensionId: extension.id, extensionName: DND35_COMPLETE_WARRIOR_NAME },
    ]);
    expect(await RulesetExtensionsService.getExtensions(session, draft.id)).toMatchObject([
      { extensionId: extension.id, extensionName: DND35_COMPLETE_WARRIOR_NAME, updateAvailable: expect.any(Boolean) },
    ]);
    // Its feats count toward what publishing requires.
    expect(await RulesetsService.publishRuleset(session, draft.id)).toMatchObject({ status: "Published" });
  });

  test("adds the extension's feats to the fork's: Complete Warrior brings 581 of its own", async () => {
    const { session, extension, draft } = await setupFork();
    const total = async () => {
      const { extensionRulesetIds, ancestorRulesetIds } = (await Rulesets.findOne(db, { id: draft.id }))!;
      const sourceChain = [...extensionRulesetIds, ...ancestorRulesetIds];
      return (
        await fetchEveryPage((page) =>
          Feats.findPage(db, { rulesetId: draft.id, ancestorRulesetIds: sourceChain }, page),
        )
      ).length;
    };
    const before = await total();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    // 602 feats, 21 of which override a base feat.
    expect(await total()).toBe(before + 581);
  });

  test("takes several extensions, system or published by users, on a draft or a published fork", async () => {
    const { user, session, extension, draft } = await setupFork();
    const [systemExtension, homebrew] = [await createExtension(), await createExtension(user.id)];
    await Feats.create(db, { name: "Homebrew Feat", rulesetId: homebrew.id });
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    await RulesetsService.publishRuleset(session, draft.id);
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [systemExtension.id, homebrew.id]);

    expect((await Rulesets.findOne(db, { id: draft.id }))!.extensionRulesetIds).toEqual([
      extension.id,
      systemExtension.id,
      homebrew.id,
    ]);
    expect(await RulesetExtensions.findMany(db, { rulesetId: draft.id })).toHaveLength(3);
    expect(await featsNamed(draft.id, "Homebrew Feat")).toHaveLength(1);
  });

  test("refuses what isn't a public published extension of the same base, and hosts that can't take one", async () => {
    const { user, session, extension, draft } = await setupFork();
    const { session: other } = await createTestUser();
    const subscribe = (id: string, s = session, host = draft.id) =>
      RulesetExtensionsService.subscribeExtension(s, host, [id]);
    // Run one at a time: the test's transaction has a single connection.
    const refusals: [string, () => Promise<unknown>][] = [
      ["itself", async () => subscribe(draft.id)],
      [
        "a fork published as a ruleset",
        async () => subscribe((await createExtension(user.id, { kind: "ruleset" })).id),
      ],
      ["a draft", async () => subscribe((await createExtension(user.id, { status: "Draft" })).id)],
      ["a private extension", async () => subscribe((await createExtension(user.id, { private: true })).id)],
      [
        "an extension of another base",
        async () =>
          subscribe(
            (
              await createTestRuleset(null, {
                kind: "extension",
                status: "Published",
                private: false,
                rulesetId: (await createTestRuleset(null)).id,
              })
            ).id,
          ),
      ],
      [
        "into a ruleset that isn't a fork",
        async () => subscribe(extension.id, session, (await createTestRuleset(user.id)).id),
      ],
    ];
    for (const [what, refuse] of refusals) {
      const outcome = await refuse().then(
        () => "subscribed",
        (error: Error) => error.constructor.name,
      );
      expect({ what, outcome }).toEqual({ what, outcome: "UnprocessableEntityError" });
    }

    const archived = await forkBase(session);
    await RulesetsService.publishRuleset(session, archived.id);
    await RulesetsService.archiveRuleset(session, archived.id);
    await expect(subscribe(extension.id, session, archived.id)).rejects.toThrow(UnprocessableEntityError);
    await expect(subscribe(extension.id, other)).rejects.toThrow(ForbiddenError);
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    await expectRefusedWith(subscribe(extension.id), 409);
  });

  test("refuses extensions to a fork others use as one", async () => {
    // Publishing refuses to make a fork with extensions an extension (RulesetsService.test.ts);
    // this is the other way round: extensions of its own would reach its subscribers second-hand.
    const { session, extension } = await setupFork();
    const { session: other } = await createTestUser();
    const homebrew = await forkBase(other);
    await RulesetsService.publishRuleset(other, homebrew.id, { kind: "extension" });
    await RulesetExtensionsService.subscribeExtension(session, (await forkBase(session)).id, [homebrew.id]);
    await expect(RulesetExtensionsService.subscribeExtension(other, homebrew.id, [extension.id])).rejects.toThrow(
      UnprocessableEntityError,
    );
  });

  test("keeps an archived user extension for its subscribers, but takes no new ones", async () => {
    const { session } = await setupFork();
    const { session: author } = await createTestUser();
    const homebrew = await forkBase(author);
    await RulesetsService.publishRuleset(author, homebrew.id, { kind: "extension" });
    const subscriber = await forkBase(session);
    await RulesetExtensionsService.subscribeExtension(session, subscriber.id, [homebrew.id]);
    await RulesetsService.archiveRuleset(author, homebrew.id);

    expect((await Rulesets.findOne(db, { id: subscriber.id }))!.extensionRulesetIds).toEqual([homebrew.id]);
    await expect(
      RulesetExtensionsService.subscribeExtension(session, (await forkBase(session)).id, [homebrew.id]),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  describe("names", () => {
    test("refuses a name the fork already uses, or that two extensions share in content that can't be merged", async () => {
      const { user, session, draft } = await setupFork();
      const extension = await createExtension(user.id);
      await Feats.create(db, { name: "Clash", rulesetId: extension.id });
      await Feats.create(db, { name: "Clash", rulesetId: draft.id });
      await expect(
        RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]),
      ).rejects.toMatchObject({ refusal: "conflict" });

      // Only feats and powers merge; two races of one name would show twice.
      const [raceA, raceB] = [await createExtension(), await createExtension()];
      for (const { id } of [raceA, raceB])
        await Races.create(db, { name: "Tiefling", rulesetId: id, size: "Medium", baseSpeed: 30 });
      await expect(
        RulesetExtensionsService.subscribeExtension(session, draft.id, [raceA.id, raceB.id]),
      ).rejects.toMatchObject({ refusal: "conflict" });
    });

    test("accepts same-named feats and aptitudes across extensions, an extension's copy of a base feat, and an old clash not involving the new extension", async () => {
      const { user, session, draft } = await setupFork();
      const { featMap } = await getSeedCtx();
      const [a, b, c, d] = [
        await createExtension(user.id),
        await createExtension(user.id),
        await createExtension(user.id),
        await createExtension(user.id),
      ];
      for (const { id } of [a, b]) {
        await Feats.create(db, { name: "Shared Feat", rulesetId: id });
        await Aptitudes.create(db, { name: "Shared Aptitude", rulesetId: id });
      }
      // A copy of a base feat has the base feat's name.
      await copyEntity(db, "feats", featMap["Toughness"], c);
      await RulesetExtensionsService.subscribeExtension(session, draft.id, [a.id, b.id, c.id]);
      await RulesetExtensionsService.subscribeExtension(session, draft.id, [d.id]);

      expect((await Rulesets.findOne(db, { id: draft.id }))!.extensionRulesetIds).toEqual([a.id, b.id, c.id, d.id]);
      expect(await featsNamed(draft.id, "Shared Feat")).toHaveLength(1);
    });

    test("pairs same-named rows as siblings, an extension's winning over the base's", async () => {
      const { session, draft } = await setupFork();
      const { rulesetId } = await getSeedCtx();
      const [a, b] = [await createExtension(), await createExtension()];
      const [[spellA], [spellB], [basePower], [reprint]] = [
        await Powers.create(db, { name: "Forestfold", rulesetId: a.id }),
        await Powers.create(db, { name: "Forestfold", rulesetId: b.id }),
        await Powers.create(db, { name: "Reprint", rulesetId }),
        await Powers.create(db, { name: "Reprint", rulesetId: a.id }),
      ];
      await RulesetExtensionsService.subscribeExtension(session, draft.id, [a.id, b.id]);
      RulesetViews.invalidate(draft.id);
      const cow = await RulesetViews.getCowData((await Rulesets.findOne(db, { id: draft.id }))!);

      const [winner, loser] = cow.hasSiblings(spellA.id) ? [spellA, spellB] : [spellB, spellA];
      expect(cow.getSiblings(winner.id)).toContain(loser.id);
      expect(cow.resolve(loser.id)).toBe(winner.id);
      expect(cow.siblingIds.has(loser.id)).toBe(true);

      expect(cow.getSiblings(reprint.id)).toContain(basePower.id);
      expect(cow.resolve(basePower.id)).toBe(reprint.id);
      expect(cow.getStaleIds()).not.toContain(reprint.id);
    });
  });

  describe("when the fork already copied a base feat an extension also copies", () => {
    test("shows one feat, the fork's copy, even through the extension's hidden copy", async () => {
      const { user, session, draft } = await setupFork();
      const { featMap } = await getSeedCtx();
      const toughness = featMap["Toughness"];
      const [a, b] = [await createExtension(user.id), await createExtension(user.id)];
      const extensionCopy = (await copyEntity(db, "feats", toughness, a)).id as string;
      await copyEntity(db, "feats", toughness, b);
      await Modifiers.create(db, {
        sourceType: "feats",
        sourceId: extensionCopy,
        target: "abilities.constitution.total",
        value: "2",
        valueType: "number",
        operator: "add",
      });

      const copy = await FeatsService.updateFeat(session, draft.id, toughness, {
        name: "Toughness",
        description: "Mine",
      });
      await RulesetExtensionsService.subscribeExtension(session, draft.id, [a.id, b.id]);

      expect(await featsNamed(draft.id, "Toughness")).toHaveLength(1);
      // A pick saved with the extension's copy reaches the fork's, whose customizations stay its own.
      const reached = await FeatsService.getFeat(draft.id, extensionCopy);
      expect(reached.id).toBe(copy.id);
      expect(reached.modifiers.map((m) => m.target)).not.toContain("abilities.constitution.total");
    });

    test("and when it copies the feat after subscribing", async () => {
      const { user, session, draft } = await setupFork();
      const { featMap } = await getSeedCtx();
      const [a, b] = [await createExtension(user.id), await createExtension(user.id)];
      for (const extension of [a, b]) await copyEntity(db, "feats", featMap["Toughness"], extension);
      await RulesetExtensionsService.subscribeExtension(session, draft.id, [a.id, b.id]);
      await FeatsService.updateFeat(session, draft.id, featMap["Toughness"], {
        name: "Toughness",
        description: "Mine",
      });
      expect(await featsNamed(draft.id, "Toughness")).toHaveLength(1);
    });
  });
});

describe("unsubscribing from an extension", () => {
  test("removes its content, the fork's copies of it and the subscription; subscribing again shows the originals", async () => {
    const { session, extension, draft } = await setupFork();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    const monkeyGrip = await warriorFeat("Monkey Grip");
    await FeatsService.updateFeat(session, draft.id, monkeyGrip.id, {
      name: "Monkey Grip",
      description: "Mine",
    });

    expect(await RulesetExtensionsService.unsubscribeExtension(session, draft.id, extension.id)).toEqual({
      unsubscribed: true,
    });
    expect((await Rulesets.findOne(db, { id: draft.id }))!.extensionRulesetIds).toEqual([]);
    expect(await featsNamed(draft.id, "Monkey Grip")).toEqual([]);
    await expectRefusedWith(FeatsService.getFeat(draft.id, monkeyGrip.id), 404);
    expect(await EntitySnapshots.findMany(db, { rulesetId: draft.id })).toEqual([]);
    expect(await RulesetExtensions.findMany(db, { rulesetId: draft.id })).toEqual([]);

    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    expect((await FeatsService.getFeats(draft.id, { search: "Monkey Grip" }, firstPage)).items).toMatchObject([
      { id: monkeyGrip.id, rulesetId: extension.id },
    ]);
    expect(await RulesetExtensions.findMany(db, { rulesetId: draft.id })).toHaveLength(1);
  });

  test("repoints the fork's links and class grants from its lists to the lists of their names it keeps", async () => {
    const { session, extension: warrior, draft } = await setupFork();
    const dmg = await findSeededRuleset(DND35_DMG_NAME);
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [warrior.id, dmg.id]);
    const subscribed = await RulesetViews.getData((await Rulesets.findOne(db, { id: draft.id }))!);
    const lists = [...subscribed.aptitudesById.values()];
    const warriorAssassin = lists.find((list) => list.name === "Assassin Spells")!;
    expect(warriorAssassin.rulesetId).toBe(warrior.id);
    const wizard = lists.find((list) => list.name === "Wizard Spells")!;
    const [spell] = await Powers.create(db, { name: `Probe ${uniqueId()}`, rulesetId: draft.id });
    await PowersAptitudes.create(db, { powerId: spell.id, aptitudeId: warriorAssassin.id, level: 2 });
    await PowersAptitudes.create(db, { powerId: spell.id, aptitudeId: wizard.id, level: 3 });
    const { klassLevel } = await createTestKlassLevel(draft.id);
    await KlassLevelPowers.createMany(db, [
      { klassLevelId: klassLevel.id, powerId: spell.id, aptitudeId: warriorAssassin.id, free: false },
    ]);
    RulesetViews.invalidate(draft.id);

    await RulesetExtensionsService.unsubscribeExtension(session, draft.id, warrior.id);
    const after = await RulesetViews.getData((await Rulesets.findOne(db, { id: draft.id }))!);
    const dmgAssassin = [...after.aptitudesById.values()].find((list) => list.name === "Assassin Spells")!;
    expect(dmgAssassin.rulesetId).toBe(dmg.id);
    expect(
      (await PowersAptitudes.findMany(db, { powerId: spell.id })).map(({ aptitudeId, level }) => ({
        aptitudeId,
        level,
      })),
    ).toEqual(
      expect.arrayContaining([
        { aptitudeId: dmgAssassin.id, level: 2 },
        { aptitudeId: wizard.id, level: 3 },
      ]),
    );
    expect(after.listPowerIds({ aptitudeId: dmgAssassin.id })).toContain(spell.id);
    expect(await KlassLevelPowers.findMany(db, { klassLevelIds: [klassLevel.id] })).toMatchObject([
      { powerId: spell.id, aptitudeId: dmgAssassin.id },
    ]);
  });

  test("repoints a copied spell's merged links to the lists of their names the fork's other books have", async () => {
    const { user, session } = await createTestUser();
    const fork = await createSeededTestRulesetWithExtensions(user.id);
    const warrior = await findSeededRuleset(DND35_COMPLETE_WARRIOR_NAME);
    const view = await RulesetViews.getData(fork);
    // Alter Self's copies merge in Complete Warrior's lists, its Assassin Spells the winner of the books' namesakes
    const alterSelf = [...view.powersById.values()].find((power) => power.name === "Alter Self")!;
    const { id: copyId } = await withTransaction(async (tx) =>
      (await editRuleset(EntityEdit, fork)).cowToEdit(tx, "powers", alterSelf),
    );

    await RulesetExtensionsService.unsubscribeExtension(session, fork.id, warrior.id);
    const after = await RulesetViews.getData((await Rulesets.findOne(db, { id: fork.id }))!);
    const links = await PowersAptitudes.findMany(db, { powerId: copyId });
    expect(links.filter((link) => !after.aptitudesById.has(link.aptitudeId))).toEqual([]);
    const assassin = [...after.aptitudesById.values()].find((list) => list.name === "Assassin Spells")!;
    expect(assassin.rulesetId).not.toBe(warrior.id);
    expect(after.listPowerIds({ aptitudeId: assassin.id })).toContain(copyId);
  });

  test("refuses to leave a link to a list no other book has, naming it, and changes nothing", async () => {
    const { session, extension: warrior, draft } = await setupFork();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [warrior.id]);
    const subscribed = await RulesetViews.getData((await Rulesets.findOne(db, { id: draft.id }))!);
    const lists = [...subscribed.aptitudesById.values()];
    const warriorOnly = lists.find(
      (list) => list.rulesetId === warrior.id && !lists.some((other) => other !== list && other.name === list.name),
    )!;
    const [spell] = await Powers.create(db, { name: `Probe ${uniqueId()}`, rulesetId: draft.id });
    await PowersAptitudes.create(db, { powerId: spell.id, aptitudeId: warriorOnly.id, level: 1 });

    await expect(RulesetExtensionsService.unsubscribeExtension(session, draft.id, warrior.id)).rejects.toThrow(
      `${warriorOnly.name}, a list no other book of this ruleset has`,
    );
    expect((await Rulesets.findOne(db, { id: draft.id }))!.extensionRulesetIds).toEqual([warrior.id]);
    expect(await PowersAptitudes.findMany(db, { powerId: spell.id })).toMatchObject([{ aptitudeId: warriorOnly.id }]);
  });

  test("refuses to leave a class's grant of the extension's feat", async () => {
    const { session, extension: warrior, draft } = await setupFork();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [warrior.id]);
    const monkeyGrip = await warriorFeat("Monkey Grip");
    const { klassLevel } = await createTestKlassLevel(draft.id);
    const general = (await Aptitudes.findOne(db, { rulesetId: draft.ancestorRulesetIds[0], name: "General" }))!;
    await KlassLevelFeats.create(db, { klassLevelId: klassLevel.id, featId: monkeyGrip.id, aptitudeId: general.id });

    await expect(RulesetExtensionsService.unsubscribeExtension(session, draft.id, warrior.id)).rejects.toThrow(
      /, which uses Monkey Grip/,
    );
  });

  test("refuses to leave a row naming another of the extension's entities: a class's skill", async () => {
    const { user, session, draft } = await setupFork();
    const extension = await createExtension(user.id);
    const strength = (await Abilities.findOne(db, { rulesetId: draft.ancestorRulesetIds[0], name: "Strength" }))!;
    const [skill] = await Skills.create(db, {
      name: `Probe Skill ${uniqueId()}`,
      rulesetId: extension.id,
      primaryAbilityId: strength.id,
    });
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    const [klass] = await Klasses.create(db, { name: `Probe Class ${uniqueId()}`, rulesetId: draft.id, hd: 8 });
    await KlassSkills.createMany(db, [{ klassId: klass.id, skillId: skill.id }]);

    await expect(RulesetExtensionsService.unsubscribeExtension(session, draft.id, extension.id)).rejects.toThrow(
      `${klass.name}, which uses ${skill.name}`,
    );
  });

  test("keeps the other extensions and the fork's copies of theirs", async () => {
    const { session, extension, draft } = await setupFork();
    const other = await createExtension();
    const [otherFeat] = await Feats.create(db, { name: "Other Feat", rulesetId: other.id });
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id, other.id]);
    const copy = await FeatsService.updateFeat(session, draft.id, otherFeat.id, {
      name: "Other Feat",
      description: "Mine",
    });

    await RulesetExtensionsService.unsubscribeExtension(session, draft.id, extension.id);
    expect((await Rulesets.findOne(db, { id: draft.id }))!.extensionRulesetIds).toEqual([other.id]);
    expect(await featsNamed(draft.id, "Other Feat")).toMatchObject([{ id: copy.id }]);
  });

  test("removes the fork's copies of its content and keeps those of its base's, of every kind", async () => {
    const { user, session, draft } = await setupFork();
    const extension = await createExtension(user.id);
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    const ctx = await getSeedCtx();
    const name = (kind: string) => `${kind} ${uniqueId()}`;
    // The core rules have no mechanics: one of the base's own
    const [baseMechanic] = await Mechanics.create(db, { name: name("Grapple"), rulesetId: ctx.rulesetId });
    invalidateSeededRuleset(ctx.rulesetId);
    const fromBase = [
      ["abilities", ctx.abilityMap["Strength"]],
      ["saves", ctx.saveMap["Fortitude"]],
      ["skills", ctx.skillMap["Climb"]],
      ["feats", ctx.featMap["Toughness"]],
      ["powers", ctx.powerMap["Magic Missile"]],
      ["items", ctx.itemMap["Longsword"]],
      ["races", ctx.raceMap.pc["Human"]],
      ["languages", ctx.langMap["Elven"]],
      ["klasses", ctx.klassMap.pc["Fighter"]],
      ["aptitudes", ctx.aptMap["General"]],
      ["mechanics", baseMechanic.id],
    ] as const;

    // An extension adds every kind but abilities, which only the core rules define
    const rulesetId = extension.id;
    const charisma = ctx.abilityMap["Charisma"];
    const fromExtension = [
      ["saves", (await Saves.create(db, { name: name("Luck Save"), abilityId: charisma, rulesetId }))[0].id],
      ["skills", (await Skills.create(db, { name: name("Gambling"), primaryAbilityId: charisma, rulesetId }))[0].id],
      ["feats", (await Feats.create(db, { name: name("Lucky"), rulesetId }))[0].id],
      ["powers", (await Powers.create(db, { name: name("Fortune"), rulesetId }))[0].id],
      ["items", (await Items.create(db, { name: name("Charm"), slot: "Neck", rulesetId }))[0].id],
      [
        "races",
        (await Races.create(db, { name: name("Halfling Kin"), size: "Small", baseSpeed: 20, rulesetId }))[0].id,
      ],
      ["languages", (await Languages.create(db, { name: name("Cant"), type: "Secret", rulesetId }))[0].id],
      ["klasses", (await Klasses.create(db, { name: name("Gambler"), hd: 6, rulesetId }))[0].id],
      ["aptitudes", (await Aptitudes.create(db, { name: name("Luck Feats"), rulesetId }))[0].id],
      ["mechanics", (await Mechanics.create(db, { name: name("Wager"), rulesetId }))[0].id],
    ] as const;

    for (const [type, id] of [...fromBase, ...fromExtension])
      await copyEntity(db, type, id, { ...draft, extensionRulesetIds: [extension.id] });
    const copies = await EntitySnapshots.findMany(db, { rulesetId: draft.id });
    const ofBase = copies.filter((copy) => fromBase.some(([, id]) => copy.sourceEntityId === id));
    expect(new Set(ofBase.map((copy) => copy.entityType))).toEqual(new Set(fromBase.map(([type]) => type)));
    expect(copies).toHaveLength(fromBase.length + fromExtension.length);

    expect(await RulesetExtensionsService.unsubscribeExtension(session, draft.id, extension.id)).toEqual({
      unsubscribed: true,
    });
    expect(await EntitySnapshots.findMany(db, { rulesetId: draft.id })).toEqual(ofBase);
  });

  test("is refused while a character picked its content, or the fork's copy of it, even an archived character", async () => {
    const { user, session, extension, draft } = await setupFork();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    const [monkeyGrip, trooper] = [await warriorFeat("Monkey Grip"), await warriorFeat("Shock Trooper")];
    // A character of the fork who picked nothing from the extension doesn't count.
    await createTestCharacter(user.id, { rulesetId: draft.id });

    const direct = await pickFeat(user.id, draft.id, monkeyGrip.id, monkeyGrip.aptitudeId);
    await Characters.archive(db, { id: direct.id });
    await expect(RulesetExtensionsService.unsubscribeExtension(session, draft.id, extension.id)).rejects.toThrow(
      ConflictError,
    );
    await Characters.delete(db, { id: direct.id });

    const copy = await FeatsService.updateFeat(session, draft.id, trooper.id, {
      name: "Shock Trooper",
      description: "Mine",
    });
    await pickFeat(user.id, draft.id, copy.id, trooper.aptitudeId);
    await expect(RulesetExtensionsService.unsubscribeExtension(session, draft.id, extension.id)).rejects.toThrow(
      ConflictError,
    );
  });

  test("refuses an extension the fork doesn't use, another user, and an archived fork", async () => {
    const { session, extension, draft } = await setupFork();
    const { session: other } = await createTestUser();
    await expect(RulesetExtensionsService.unsubscribeExtension(session, draft.id, extension.id)).rejects.toThrow(
      NotFoundError,
    );
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    await expect(RulesetExtensionsService.unsubscribeExtension(other, draft.id, extension.id)).rejects.toThrow(
      ForbiddenError,
    );

    await RulesetsService.publishRuleset(session, draft.id);
    await RulesetsService.archiveRuleset(session, draft.id);
    await expect(RulesetExtensionsService.unsubscribeExtension(session, draft.id, extension.id)).rejects.toThrow(
      UnprocessableEntityError,
    );
  });
});

describe("an extension's content in a fork", () => {
  // A book puts its spells on its own copy of another book's list, which the fork merges with that book's
  test.each([
    ["the DMG's assassin list", DND35_DMG_NAME, "Assassin Spells", "Critical Strike"],
    [
      "Complete Arcane's sublime chord list, the bard's and the sorcerer's",
      DND35_COMPLETE_ARCANE_NAME,
      "Sublime Chord Spells",
      "Fly, Swift",
    ],
  ])("lists Complete Adventurer's spells on %s once the fork takes both books", async (_, book, list, spell) => {
    const { session } = await createTestUser();
    const draft = await forkBase(session);
    const [owner, adventurer] = [
      await findSeededRuleset(book),
      await findSeededRuleset(DND35_COMPLETE_ADVENTURER_NAME),
    ];
    const aptitude = (await Aptitudes.findOne(db, { name: list, rulesetId: owner.id }))!;
    const spellsOnList = async () =>
      (await PowersService.getPowers(draft.id, { aptitudeId: aptitude.id }, { limit: 1000, page: 1 })).items.map(
        (power) => power.name,
      );
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [owner.id]);
    expect(await spellsOnList()).not.toContain(spell);
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [adventurer.id]);
    expect(await spellsOnList()).toContain(spell);
  });

  test("lists and offers a spell whose link to a list is on another book's copy of the spell", async () => {
    // Bull's Strength composes as Complete Warrior's copy, while Complete Divine's puts it on the favored soul's list
    const { draft, list, offer } = await favoredSoulOnMixedFork();
    const search = "Bull's Strength";
    const listed = await PowersService.getPowers(draft.id, { aptitudeId: list.id, search }, firstPage);
    expect(listed.items.map((power) => power.name)).toContain(search);
    expect((await offer({ search })).items.map((power) => power.name)).toContain(search);
  });

  test("lists and offers a feat whose link to a list is on another book's copy of the feat", async () => {
    // With Complete Adventurer before Complete Warrior, Combat Casting composes as Complete Adventurer's copy, while
    // Complete Warrior's puts it on the hexblade's bonus feats
    const { session, draft, character } = await forkTaking(DND35_COMPLETE_ADVENTURER_NAME, DND35_COMPLETE_WARRIOR_NAME);
    const warrior = await findSeededRuleset(DND35_COMPLETE_WARRIOR_NAME);
    const hexblade = (await Klasses.findOne(db, { name: "Hexblade", rulesetId: warrior.id }))!;
    const list = (await Aptitudes.findOne(db, { name: "Hexblade Bonus Feat", rulesetId: warrior.id }))!;
    const search = "Combat Casting";
    const where = { aptitudeId: list.id, search };
    expect((await FeatsService.getFeats(draft.id, where, firstPage)).items.map((feat) => feat.name)).toContain(search);
    expect(
      (await FeatsService.getFeatGroups(draft.id, where, firstPage)).items.map((group) => group.displayName),
    ).toContain(search);
    const offered = await CharacterLevelsService.getAvailableFeats(
      session,
      character.id,
      { aptitudeId: list.id, classId: hexblade.id, level: 1, search },
      firstPage,
    );
    expect(offered.items.map((feat) => feat.name)).toContain(search);
  });

  test("gives a spell picked on a list another book's copy composes its level there", async () => {
    // Complete Divine's rows link Bane and Bless Water to its own list; Bless Water composes as Complete Warrior's copy
    const { character, favoredSoul, list, offer } = await favoredSoulOnMixedFork();
    const warrior = await findSeededRuleset(DND35_COMPLETE_WARRIOR_NAME);
    expect(list.id).toBe((await Aptitudes.findOne(db, { name: "Favored Soul Spells", rulesetId: warrior.id }))!.id);

    // Bane as the level-up offers it, and Bless Water as the fork composes it, on the composed list
    const bane = (await offer({ search: "Bane", powerLevel: 1 })).items.find((power) => power.name === "Bane")!;
    const blessWater = (await Powers.findOne(db, { name: "Bless Water", rulesetId: warrior.id }))!;
    const [first] = (await KlassLevels.findMany(db, { klassId: favoredSoul.id })).filter((level) => level.level === 1);
    await addCharacterLevel(character.id, first.id, {
      powers: [
        { powerId: bane.id, aptitudeId: list.id },
        { powerId: blessWater.id, aptitudeId: list.id },
      ],
    });

    const detailed = await buildAs(DetailedCharacter, character);
    const [level] = detailed.components.classes.getClasses()["favoredsoul"].levels;
    expect(Object.fromEntries(level.powers.map((power) => [power.name, power.powerLevel]))).toEqual({
      Bane: 1,
      "Bless Water": 1,
    });
  });

  test("is edited and deleted on the fork's copies, the extension's rows untouched", async () => {
    const { session, extension, draft } = await setupFork();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    const [monkeyGrip, buckler] = [await warriorFeat("Monkey Grip"), await warriorFeat("Improved Buckler Defense")];

    const copy = await FeatsService.updateFeat(session, draft.id, monkeyGrip.id, {
      name: "Monkey Grip",
      description: "Mine",
    });
    expect(await FeatsService.getFeat(draft.id, copy.id)).toMatchObject({
      rulesetId: draft.id,
      description: "Mine",
    });

    await FeatsService.deleteFeat(session, draft.id, buckler.id);
    expect(await featsNamed(draft.id, "Improved Buckler Defense")).toEqual([]);
    expect(await Feats.findOne(db, { id: buckler.id })).toMatchObject({ deletedAt: null });
  });

  test("keeps its names: a new feat can't take one, even once the fork copied it", async () => {
    const { session, extension, draft } = await setupFork();
    const { aptMap } = await getSeedCtx();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    const create = (name: string) =>
      FeatsService.createFeat(session, draft.id, { name, aptitudeIds: [aptMap["General"]] });

    await expectRefusedWith(create("Monkey Grip"), 409);
    await FeatsService.updateFeat(session, draft.id, (await warriorFeat("Monkey Grip")).id, {
      name: "Monkey Grip",
      description: "Mine",
    });
    // The copy holds the name in the fork: the database refuses a second one.
    await expect(create("Monkey Grip")).rejects.toThrow();
    expect(await create(`Unique Feat ${uniqueId()}`)).toMatchObject({ rulesetId: draft.id });
  });

  test("keeps domain links on spells the extension copied", async () => {
    const { session, extension, draft } = await setupFork();
    const { aptMap } = await getSeedCtx();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);

    const deathDomain = await PowersService.getPowers(
      draft.id,
      { aptitudeId: aptMap["Death Domain Spells"] },
      firstPage,
    );
    expect(deathDomain.items.map((p) => p.name)).toEqual(
      expect.arrayContaining(["Cause Fear", "Death Knell", "Animate Dead", "Wail of the Banshee"]),
    );

    const [animateDead] = (await PowersService.getPowers(draft.id, { search: "Animate Dead" }, firstPage)).items;
    expect(animateDead.powersAptitudesInRules.map((link) => link.aptitudesInRule?.name)).toContain(
      "Death Domain Spells",
    );
  });

  test("lets a character validate with a feat two extensions both override", async () => {
    // The Dungeon Master's Guide and Complete Divine both override Damage Reduction.
    const { user, session, draft } = await setupFork();
    const { abilityMap, aptMap, featMap, klassMap } = await getSeedCtx();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [
      (await findSeededRuleset(DND35_DMG_NAME)).id,
      (await findSeededRuleset(DND35_COMPLETE_DIVINE_NAME)).id,
    ]);
    const character = await createTestCharacter(user.id, { rulesetId: draft.id, xp: 21000 });
    await db
      .insert(characterAbilitiesInCharacter)
      .values(Object.values(abilityMap).map((abilityId) => ({ characterId: character.id, abilityId, score: 10 })));
    const barbarianLevels = (await KlassLevels.findMany(db, { klassId: klassMap.pc["Barbarian"] }))
      .filter((l) => l.level <= 7)
      .sort((a, b) => a.level - b.level);
    for (const level of barbarianLevels) {
      const picks =
        level.level === 7
          ? {
              feats: [
                { featId: featMap["Damage Reduction (Barbarian)"], aptitudeId: aptMap["Barbarian Class Feature"] },
              ],
            }
          : {};
      await addCharacterLevel(character.id, level.id, picks);
    }
    RulesetViews.invalidate(draft.id);

    const detailed = await buildAs(DetailedCharacter, character);
    expect(detailed.validate().issues.filter((issue) => issue.entityName === "Damage Reduction (Barbarian)")).toEqual(
      [],
    );
  });
});

describe("two extensions overriding the same base entity", () => {
  describe.each(["feats", "powers"] as const)("%s", (entityType) => {
    const entity = ENTITIES[entityType];

    test("shows one, merging both extensions' aptitudes, requirements and modifiers without repeats", async () => {
      const { draft, baseId, contributions } = await setupSiblings(entityType);
      const aptitudeIds = contributions.map((c) => c.aptitudeId);

      const detail = await entity.get(draft.id, baseId);
      expect(detail.links.map((l) => l.aptitudeId)).toEqual(expect.arrayContaining(aptitudeIds));
      expect(unique(detail.links.map((l) => l.aptitudeId))).toBe(true);
      expect(detail.requirements.map((r) => r.target)).toEqual(
        expect.arrayContaining(contributions.map((c) => c.requirement)),
      );
      expect(detail.modifiers.map((m) => m.target)).toEqual(
        expect.arrayContaining(contributions.map((c) => c.modifier)),
      );

      const listed = (await entity.list(draft.id, entity.name)).filter((row) => row.name === entity.name);
      expect(listed).toHaveLength(1);
      expect(listed[0].links.map((l) => l.aptitudeId)).toEqual(expect.arrayContaining(aptitudeIds));

      const requirements = await RequirementsService.getRequirements(draft.id, entityType, baseId);
      expect(requirements.map((r) => r.target)).toEqual(
        expect.arrayContaining(contributions.map((c) => c.requirement)),
      );
      expect(unique(requirements.filter((r) => r.target).map((r) => `${r.target}|${r.operator}|${r.value}`))).toBe(
        true,
      );
      const modifiers = await ModifiersService.getModifiers(draft.id, entityType, baseId);
      expect(modifiers.map((m) => m.target)).toEqual(expect.arrayContaining(contributions.map((c) => c.modifier)));
      expect(unique(modifiers.map((m) => `${m.target}|${m.value}|${m.operator}`))).toBe(true);
    });

    test("editing it in the fork gives the fork's copy both extensions' aptitudes, requirements and modifiers", async () => {
      const { session, draft, baseId, contributions } = await setupSiblings(entityType);
      await entity.edit(session, draft.id, baseId);
      const [snapshot] = await EntitySnapshots.findMany(db, { rulesetId: draft.id });
      const copyId = snapshot.forkedEntityId;

      expect((await entity.links(copyId)).map((l) => l.aptitudeId)).toEqual(
        expect.arrayContaining(contributions.map((c) => c.aptitudeId)),
      );
      expect((await Requirements.findMany(db, { entityIds: [copyId], entityType })).map((r) => r.target)).toEqual(
        expect.arrayContaining(contributions.map((c) => c.requirement)),
      );
      expect(
        (await Modifiers.findMany(db, { sourceIds: [copyId], sourceType: entityType })).map((m) => m.target),
      ).toEqual(expect.arrayContaining(contributions.map((c) => c.modifier)));
    });
  });

  test("editing the feat keeps an extension's either-or requirement as its own group", async () => {
    // Regression: the losing sibling's OR chain was lifted into the copy's AND,
    // or merged into another OR group: both change who qualifies.
    const { session, draft, baseId, contributions } = await setupSiblings("feats");
    // Find which extension's copy wins, then undo that trial copy.
    await ENTITIES.feats.edit(session, draft.id, baseId);
    const [trial] = await EntitySnapshots.findMany(db, { rulesetId: draft.id });
    await Feats.delete(db, { id: trial.forkedEntityId });
    await EntitySnapshots.delete(db, { sourceEntityId: trial.sourceEntityId, rulesetId: draft.id });
    const loser = contributions.find((c) => c.copyId !== trial.sourceEntityId)!;
    const either = ["abilities.constitution.total", "abilities.intelligence.total"];
    await Requirements.create(db, { entityId: loser.copyId, entityType: "feats", level: "5", chainingOperator: "or" });
    for (const [index, target] of either.entries()) {
      await Requirements.create(db, {
        entityId: loser.copyId,
        entityType: "feats",
        level: `5.${index + 1}`,
        target,
        value: "13",
        valueType: "number",
        operator: "greater_than_or_equal",
      });
    }

    await ENTITIES.feats.edit(session, draft.id, baseId);
    const [snapshot] = await EntitySnapshots.findMany(db, { rulesetId: draft.id });
    const requirements = await Requirements.findMany(db, {
      entityIds: [snapshot.forkedEntityId],
      entityType: "feats",
    });

    const orRoots = requirements.filter((r) => r.chainingOperator === "or" && /^\d+$/.test(r.level));
    expect(orRoots).toHaveLength(1);
    const underRoot = (r: { level: string }) => r.level.startsWith(`${orRoots[0].level}.`);
    expect(
      requirements
        .filter((r) => underRoot(r) && r.target)
        .map((r) => r.target)
        .sort(),
    ).toEqual(either);
    expect(requirements.filter((r) => !underRoot(r) && !r.chainingOperator && either.includes(r.target!))).toEqual([]);
  });

  test("pairs the two copies once, by the snapshot, not again by name", async () => {
    const { draft, baseId, contributions } = await setupSiblings("feats");
    RulesetViews.invalidate(draft.id);
    const cow = await RulesetViews.getCowData((await Rulesets.findOne(db, { id: draft.id }))!);
    const winner = cow.resolve(baseId);
    const loser = contributions.map((c) => c.copyId).find((id) => id !== winner)!;
    expect(cow.getSiblings(winner).filter((id) => id === loser)).toHaveLength(1);
  });
});
