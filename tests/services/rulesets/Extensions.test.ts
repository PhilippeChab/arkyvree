import { describe, expect, test } from "bun:test";

import type { InferInsertModel } from "drizzle-orm";

import {
  DND35_COMPLETE_DIVINE_NAME,
  DND35_COMPLETE_WARRIOR_NAME,
  DND35_DMG_NAME,
} from "@/database/packages/dnd35/names.ts";
import { characterAbilitiesInCharacter, type rulesetsInRules } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import {
  Aptitudes,
  Characters,
  EntitySnapshots,
  Feats,
  FeatsAptitudes,
  Items,
  Klasses,
  KlassLevels,
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
import DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import { cowEntity, getOrBuildCowData, invalidateAllCowData } from "@/server/services/rulesets/cow.ts";
import ModifiersService from "@/server/services/rulesets/customization/ModifiersService.ts";
import RequirementsService from "@/server/services/rulesets/customization/RequirementsService.ts";
import FeatsService from "@/server/services/rulesets/FeatsService.ts";
import PowersService from "@/server/services/rulesets/PowersService.ts";
import RulesetsService from "@/server/services/RulesetsService.ts";
import type { Session } from "@/shared/relations.ts";
import {
  addCharacterLevel,
  createTestCharacter,
  createTestKlassLevel,
  createTestRuleset,
  createTestUser,
  getSeedCtx,
  invalidateSeededRuleset,
  methodsOf,
  uniqueId,
} from "@/tests/helpers.ts";

const ModifiersMethods = methodsOf(ModifiersService);
const RequirementsMethods = methodsOf(RequirementsService);
const FeatsMethods = methodsOf(FeatsService);
const PowersMethods = methodsOf(PowersService);
const RulesetsMethods = methodsOf(RulesetsService);

type RulesetValues = Partial<InferInsertModel<typeof rulesetsInRules>>;
const firstPage = { limit: 50, page: 1 };

async function seededRuleset(name: string) {
  return (await Rulesets.findOne(db, { name }))!;
}

async function forkBase(session: Session, values: { private?: boolean } = {}) {
  const { rulesetId } = await getSeedCtx();
  return await RulesetsMethods.forkRuleset(session, rulesetId, {
    name: `Fork ${uniqueId()}`,
    private: false,
    ...values,
  });
}

/** The seeded base, its Complete Warrior extension, and a new user's fork of the base. */
async function setupFork() {
  const { user, session } = await createTestUser();
  const { rulesetId } = await getSeedCtx();
  const base = (await Rulesets.findOne(db, { id: rulesetId }))!;
  const extension = await seededRuleset(DND35_COMPLETE_WARRIOR_NAME);
  const draft = await forkBase(session);
  return { user, session, base, extension, draft };
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

/** A seeded Complete Warrior feat, with the aptitude it's picked through. */
async function warriorFeat(name: string) {
  const extension = await seededRuleset(DND35_COMPLETE_WARRIOR_NAME);
  const feat = (await Feats.findOne(db, { name, rulesetId: extension.id }))!;
  const [link] = await FeatsAptitudes.findMany(db, { featId: feat.id });
  return { ...feat, aptitudeId: link.aptitudeId };
}

/** A character of `rulesetId` who picked the feat. */
async function pickFeat(userId: string, rulesetId: string, featId: string, aptitudeId: string) {
  const character = await createTestCharacter(userId, { rulesetId });
  const { klassLevel } = await createTestKlassLevel(rulesetId);
  await addCharacterLevel(character.id, klassLevel.id, { feats: [{ featId, aptitudeId }] });
  return character;
}

/** The fork's visible feats of this name. */
async function featsNamed(rulesetId: string, name: string) {
  return (await FeatsMethods.getRulesetFeats(rulesetId, { search: name }, firstPage)).items.filter(
    (f) => f.name === name,
  );
}

describe("subscribing to an extension", () => {
  test("adds its content to the fork without copying it, and records the subscription", async () => {
    const { session, extension, draft } = await setupFork();
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    expect((await Rulesets.findOne(db, { id: draft.id }))!.extensionRulesetIds).toEqual([extension.id]);
    const trooper = await warriorFeat("Shock Trooper");
    expect(await FeatsMethods.getRulesetFeat(draft.id, trooper.id)).toMatchObject({
      id: trooper.id,
      rulesetId: extension.id,
    });
    expect(await RulesetExtensions.findByRulesetId(db, { rulesetId: draft.id })).toMatchObject([
      { extensionId: extension.id, extensionName: DND35_COMPLETE_WARRIOR_NAME },
    ]);
    expect(await RulesetsMethods.getSubscribedExtensions(session, draft.id)).toMatchObject([
      { extensionId: extension.id, extensionName: DND35_COMPLETE_WARRIOR_NAME, updateAvailable: expect.any(Boolean) },
    ]);
    // Its feats count toward what publishing requires.
    expect(await RulesetsMethods.publishRuleset(session, draft.id)).toMatchObject({ status: "Published" });
  });

  test("adds the extension's feats to the fork's: Complete Warrior brings 578 of its own", async () => {
    const { session, extension, draft } = await setupFork();
    const total = async () => {
      const { extensionRulesetIds, ancestorRulesetIds } = (await Rulesets.findOne(db, { id: draft.id }))!;
      const sourceChain = [...extensionRulesetIds, ...ancestorRulesetIds];
      return (
        await Feats.findAll((page) =>
          Feats.findManyByRulesetId(db, { rulesetId: draft.id, ancestorRulesetIds: sourceChain }, page),
        )
      ).length;
    };
    const before = await total();
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);
    // 599 feats, 21 of which override a base feat.
    expect(await total()).toBe(before + 578);
  });

  test("takes several extensions, system or published by users, on a draft or a published fork", async () => {
    const { user, session, extension, draft } = await setupFork();
    const [systemExtension, homebrew] = [await createExtension(), await createExtension(user.id)];
    await Feats.create(db, { name: "Homebrew Feat", rulesetId: homebrew.id });
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);
    await RulesetsMethods.publishRuleset(session, draft.id);
    await RulesetsMethods.subscribeExtension(session, draft.id, [systemExtension.id, homebrew.id]);

    expect((await Rulesets.findOne(db, { id: draft.id }))!.extensionRulesetIds).toEqual([
      extension.id,
      systemExtension.id,
      homebrew.id,
    ]);
    expect(await RulesetExtensions.findByRulesetId(db, { rulesetId: draft.id })).toHaveLength(3);
    expect(await featsNamed(draft.id, "Homebrew Feat")).toHaveLength(1);
  });

  test("refuses what isn't a public published extension of the same base, and hosts that can't take one", async () => {
    const { user, session, extension, draft } = await setupFork();
    const { session: other } = await createTestUser();
    const subscribe = (id: string, s = session, host = draft.id) => RulesetsMethods.subscribeExtension(s, host, [id]);
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
    await RulesetsMethods.publishRuleset(session, archived.id);
    await RulesetsMethods.archiveRuleset(session, archived.id);
    await expect(subscribe(extension.id, session, archived.id)).rejects.toThrow(UnprocessableEntityError);
    await expect(subscribe(extension.id, other)).rejects.toThrow(ForbiddenError);
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);
    await expect(subscribe(extension.id)).rejects.toThrow(ConflictError);
  });

  test("refuses extensions to a fork others use as one", async () => {
    // Publishing refuses to make a fork with extensions an extension (RulesetsService.test.ts);
    // this is the other way round: extensions of its own would reach its subscribers second-hand.
    const { session, extension } = await setupFork();
    const { session: other } = await createTestUser();
    const homebrew = await forkBase(other);
    await RulesetsMethods.publishRuleset(other, homebrew.id, { kind: "extension" });
    await RulesetsMethods.subscribeExtension(session, (await forkBase(session)).id, [homebrew.id]);
    await expect(RulesetsMethods.subscribeExtension(other, homebrew.id, [extension.id])).rejects.toThrow(
      UnprocessableEntityError,
    );
  });

  test("keeps an archived user extension for its subscribers, but takes no new ones", async () => {
    const { session } = await setupFork();
    const { session: author } = await createTestUser();
    const homebrew = await forkBase(author);
    await RulesetsMethods.publishRuleset(author, homebrew.id, { kind: "extension" });
    const subscriber = await forkBase(session);
    await RulesetsMethods.subscribeExtension(session, subscriber.id, [homebrew.id]);
    await RulesetsMethods.archiveRuleset(author, homebrew.id);

    expect((await Rulesets.findOne(db, { id: subscriber.id }))!.extensionRulesetIds).toEqual([homebrew.id]);
    await expect(
      RulesetsMethods.subscribeExtension(session, (await forkBase(session)).id, [homebrew.id]),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  describe("names", () => {
    test("refuses a name the fork already uses, or that two extensions share in content that can't be merged", async () => {
      const { user, session, draft } = await setupFork();
      const extension = await createExtension(user.id);
      await Feats.create(db, { name: "Clash", rulesetId: extension.id });
      await Feats.create(db, { name: "Clash", rulesetId: draft.id });
      await expect(RulesetsMethods.subscribeExtension(session, draft.id, [extension.id])).rejects.toThrow(
        ConflictError,
      );

      // Only feats and powers merge; two races of one name would show twice.
      const [raceA, raceB] = [await createExtension(), await createExtension()];
      for (const { id } of [raceA, raceB])
        await Races.create(db, { name: "Tiefling", rulesetId: id, size: "Medium", baseSpeed: 30 });
      await expect(RulesetsMethods.subscribeExtension(session, draft.id, [raceA.id, raceB.id])).rejects.toThrow(
        ConflictError,
      );
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
      await cowEntity(db, "feats", featMap["Toughness"], c.id, c.ancestorRulesetIds, []);
      await RulesetsMethods.subscribeExtension(session, draft.id, [a.id, b.id, c.id]);
      await RulesetsMethods.subscribeExtension(session, draft.id, [d.id]);

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
      await RulesetsMethods.subscribeExtension(session, draft.id, [a.id, b.id]);
      invalidateAllCowData();
      const cow = await getOrBuildCowData((await Rulesets.findOne(db, { id: draft.id }))!);

      const [winner, loser] = cow.siblingMap.has(spellA.id) ? [spellA, spellB] : [spellB, spellA];
      expect(cow.siblingMap.get(winner.id)).toContain(loser.id);
      expect(cow.idResolveMap.get(loser.id)).toBe(winner.id);
      expect(cow.siblingIds.has(loser.id)).toBe(true);

      expect(cow.siblingMap.get(reprint.id)).toContain(basePower.id);
      expect(cow.idResolveMap.get(basePower.id)).toBe(reprint.id);
      expect(cow.idResolveMap.has(reprint.id)).toBe(false);
    });
  });

  describe("when the fork already copied a base feat an extension also copies", () => {
    test("shows one feat, the fork's copy, even through the extension's hidden copy", async () => {
      const { user, session, draft } = await setupFork();
      const { featMap } = await getSeedCtx();
      const toughness = featMap["Toughness"];
      const [a, b] = [await createExtension(user.id), await createExtension(user.id)];
      const extensionCopy = (await cowEntity(db, "feats", toughness, a.id, a.ancestorRulesetIds, [])).id as string;
      await cowEntity(db, "feats", toughness, b.id, b.ancestorRulesetIds, []);
      await Modifiers.create(db, {
        sourceType: "feats",
        sourceId: extensionCopy,
        target: "abilities.constitution.total",
        value: "2",
        valueType: "number",
        operator: "add",
      });

      const copy = await FeatsMethods.updateRulesetFeat(session, draft.id, toughness, {
        name: "Toughness",
        description: "Mine",
      });
      await RulesetsMethods.subscribeExtension(session, draft.id, [a.id, b.id]);

      expect(await featsNamed(draft.id, "Toughness")).toHaveLength(1);
      // A pick saved with the extension's copy reaches the fork's, whose customizations stay its own.
      const reached = await FeatsMethods.getRulesetFeat(draft.id, extensionCopy);
      expect(reached.id).toBe(copy.id);
      expect(reached.modifiers.map((m) => m.target)).not.toContain("abilities.constitution.total");
    });

    test("and when it copies the feat after subscribing", async () => {
      const { user, session, draft } = await setupFork();
      const { featMap } = await getSeedCtx();
      const [a, b] = [await createExtension(user.id), await createExtension(user.id)];
      for (const extension of [a, b])
        await cowEntity(db, "feats", featMap["Toughness"], extension.id, extension.ancestorRulesetIds, []);
      await RulesetsMethods.subscribeExtension(session, draft.id, [a.id, b.id]);
      await FeatsMethods.updateRulesetFeat(session, draft.id, featMap["Toughness"], {
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
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);
    const monkeyGrip = await warriorFeat("Monkey Grip");
    await FeatsMethods.updateRulesetFeat(session, draft.id, monkeyGrip.id, {
      name: "Monkey Grip",
      description: "Mine",
    });

    expect(await RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id)).toEqual({ unsubscribed: true });
    expect((await Rulesets.findOne(db, { id: draft.id }))!.extensionRulesetIds).toEqual([]);
    expect(await featsNamed(draft.id, "Monkey Grip")).toEqual([]);
    await expect(FeatsMethods.getRulesetFeat(draft.id, monkeyGrip.id)).rejects.toThrow(NotFoundError);
    expect(await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id })).toEqual([]);
    expect(await RulesetExtensions.findByRulesetId(db, { rulesetId: draft.id })).toEqual([]);

    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);
    expect((await FeatsMethods.getRulesetFeats(draft.id, { search: "Monkey Grip" }, firstPage)).items).toMatchObject([
      { id: monkeyGrip.id, rulesetId: extension.id },
    ]);
    expect(await RulesetExtensions.findByRulesetId(db, { rulesetId: draft.id })).toHaveLength(1);
  });

  test("keeps the other extensions and the fork's copies of theirs", async () => {
    const { session, extension, draft } = await setupFork();
    const other = await createExtension();
    const [otherFeat] = await Feats.create(db, { name: "Other Feat", rulesetId: other.id });
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id, other.id]);
    const copy = await FeatsMethods.updateRulesetFeat(session, draft.id, otherFeat.id, {
      name: "Other Feat",
      description: "Mine",
    });

    await RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id);
    expect((await Rulesets.findOne(db, { id: draft.id }))!.extensionRulesetIds).toEqual([other.id]);
    expect(await featsNamed(draft.id, "Other Feat")).toMatchObject([{ id: copy.id }]);
  });

  test("removes the fork's copies of its content and keeps those of its base's, of every kind", async () => {
    const { user, session, draft } = await setupFork();
    const extension = await createExtension(user.id);
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);
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
      await cowEntity(db, type, id, draft.id, draft.ancestorRulesetIds, [extension.id]);
    const copies = await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id });
    const ofBase = copies.filter((copy) => fromBase.some(([, id]) => copy.sourceEntityId === id));
    expect(new Set(ofBase.map((copy) => copy.entityType))).toEqual(new Set(fromBase.map(([type]) => type)));
    expect(copies).toHaveLength(fromBase.length + fromExtension.length);

    expect(await RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id)).toEqual({ unsubscribed: true });
    expect(await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id })).toEqual(ofBase);
  });

  test("is refused while a character picked its content, or the fork's copy of it, even an archived character", async () => {
    const { user, session, extension, draft } = await setupFork();
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);
    const [monkeyGrip, trooper] = [await warriorFeat("Monkey Grip"), await warriorFeat("Shock Trooper")];
    // A character of the fork who picked nothing from the extension doesn't count.
    await createTestCharacter(user.id, { rulesetId: draft.id });

    const direct = await pickFeat(user.id, draft.id, monkeyGrip.id, monkeyGrip.aptitudeId);
    await Characters.archive(db, { id: direct.id });
    await expect(RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id)).rejects.toThrow(ConflictError);
    await Characters.delete(db, { id: direct.id });

    const copy = await FeatsMethods.updateRulesetFeat(session, draft.id, trooper.id, {
      name: "Shock Trooper",
      description: "Mine",
    });
    await pickFeat(user.id, draft.id, copy.id, trooper.aptitudeId);
    await expect(RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id)).rejects.toThrow(ConflictError);
  });

  test("refuses an extension the fork doesn't use, another user, and an archived fork", async () => {
    const { session, extension, draft } = await setupFork();
    const { session: other } = await createTestUser();
    await expect(RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id)).rejects.toThrow(NotFoundError);
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);
    await expect(RulesetsMethods.unsubscribeExtension(other, draft.id, extension.id)).rejects.toThrow(ForbiddenError);

    await RulesetsMethods.publishRuleset(session, draft.id);
    await RulesetsMethods.archiveRuleset(session, draft.id);
    await expect(RulesetsMethods.unsubscribeExtension(session, draft.id, extension.id)).rejects.toThrow(
      UnprocessableEntityError,
    );
  });
});

describe("an extension's content in a fork", () => {
  test("is edited and deleted on the fork's copies, the extension's rows untouched", async () => {
    const { session, extension, draft } = await setupFork();
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);
    const [monkeyGrip, buckler] = [await warriorFeat("Monkey Grip"), await warriorFeat("Improved Buckler Defense")];

    const copy = await FeatsMethods.updateRulesetFeat(session, draft.id, monkeyGrip.id, {
      name: "Monkey Grip",
      description: "Mine",
    });
    expect(await FeatsMethods.getRulesetFeat(draft.id, copy.id)).toMatchObject({
      rulesetId: draft.id,
      description: "Mine",
    });

    await FeatsMethods.deleteRulesetFeat(session, draft.id, buckler.id);
    expect(await featsNamed(draft.id, "Improved Buckler Defense")).toEqual([]);
    expect(await Feats.findOne(db, { id: buckler.id })).toMatchObject({ deletedAt: null });
  });

  test("keeps its names: a new feat can't take one, even once the fork copied it", async () => {
    const { session, extension, draft } = await setupFork();
    const { aptMap } = await getSeedCtx();
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);
    const create = (name: string) =>
      FeatsMethods.createRulesetFeat(session, draft.id, { name, aptitudeIds: [aptMap["General"]] });

    await expect(create("Monkey Grip")).rejects.toThrow(ConflictError);
    await FeatsMethods.updateRulesetFeat(session, draft.id, (await warriorFeat("Monkey Grip")).id, {
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
    await RulesetsMethods.subscribeExtension(session, draft.id, [extension.id]);

    const deathDomain = await PowersMethods.getRulesetPowers(
      draft.id,
      { aptitudeId: aptMap["Death Domain Spells"] },
      firstPage,
    );
    expect(deathDomain.items.map((p) => p.name)).toEqual(
      expect.arrayContaining(["Cause Fear", "Death Knell", "Animate Dead", "Wail of the Banshee"]),
    );

    const [animateDead] = (await PowersMethods.getRulesetPowers(draft.id, { search: "Animate Dead" }, firstPage)).items;
    expect(animateDead.powersAptitudesInRules.map((link) => link.aptitudesInRule?.name)).toContain(
      "Death Domain Spells",
    );
  });

  test("lets a character validate with a feat two extensions both override", async () => {
    // The Dungeon Master's Guide and Complete Divine both override Damage Reduction.
    const { user, session, draft } = await setupFork();
    const { abilityMap, aptMap, featMap, klassMap } = await getSeedCtx();
    await RulesetsMethods.subscribeExtension(session, draft.id, [
      (await seededRuleset(DND35_DMG_NAME)).id,
      (await seededRuleset(DND35_COMPLETE_DIVINE_NAME)).id,
    ]);
    const character = await createTestCharacter(user.id, { rulesetId: draft.id, xp: 21000 });
    await db
      .insert(characterAbilitiesInCharacter)
      .values(Object.values(abilityMap).map((abilityId) => ({ characterId: character.id, abilityId, score: 10 })));
    const barbarianLevels = (await KlassLevels.findManyByKlass(db, { klassId: klassMap.pc["Barbarian"] }))
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
    invalidateAllCowData();

    const detailed = new DetailedCharacter(character);
    await detailed.build();
    expect(detailed.validate().issues.filter((issue) => issue.entityName === "Damage Reduction (Barbarian)")).toEqual(
      [],
    );
  });
});

describe("two extensions overriding the same base entity", () => {
  type EntityType = "feats" | "powers";
  const ENTITIES = {
    feats: {
      name: "Toughness",
      links: (id: string) => FeatsAptitudes.findMany(db, { featId: id }),
      link: (id: string, aptitudeId: string) => FeatsAptitudes.create(db, { featId: id, aptitudeId }),
      get: async (rulesetId: string, id: string) => {
        const { featsAptitudesInRules, ...rest } = await FeatsMethods.getRulesetFeat(rulesetId, id);
        return { ...rest, links: featsAptitudesInRules };
      },
      list: async (rulesetId: string, search: string) =>
        (await FeatsMethods.getRulesetFeats(rulesetId, { search }, firstPage)).items.map(
          ({ featsAptitudesInRules, ...rest }) => ({ ...rest, links: featsAptitudesInRules }),
        ),
      edit: (session: Session, rulesetId: string, id: string) =>
        FeatsMethods.updateRulesetFeat(session, rulesetId, id, { name: "Toughness", description: "Mine" }),
    },
    powers: {
      name: "Cure Light Wounds",
      links: (id: string) => PowersAptitudes.findMany(db, { powerId: id }),
      link: (id: string, aptitudeId: string) => PowersAptitudes.create(db, { powerId: id, aptitudeId, level: 1 }),
      get: async (rulesetId: string, id: string) => {
        const { powersAptitudesInRules, ...rest } = await PowersMethods.getRulesetPower(rulesetId, id);
        return { ...rest, links: powersAptitudesInRules };
      },
      list: async (rulesetId: string, search: string) =>
        (await PowersMethods.getRulesetPowers(rulesetId, { search }, firstPage)).items.map(
          ({ powersAptitudesInRules, ...rest }) => ({ ...rest, links: powersAptitudesInRules }),
        ),
      edit: (session: Session, rulesetId: string, id: string) =>
        PowersMethods.updateRulesetPower(session, rulesetId, id, { name: "Cure Light Wounds", description: "Mine" }),
    },
  };

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
      const copyId = (await cowEntity(db, entityType, baseId, extension.id, extension.ancestorRulesetIds, []))
        .id as string;
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
    await RulesetsMethods.subscribeExtension(session, draft.id, extensions);
    return { session, draft, baseId, contributions };
  }

  const unique = (keys: string[]) => new Set(keys).size === keys.length;

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

      const requirements = await RequirementsMethods.getEntityRequirements(draft.id, entityType, baseId);
      expect(requirements.map((r) => r.target)).toEqual(
        expect.arrayContaining(contributions.map((c) => c.requirement)),
      );
      expect(unique(requirements.filter((r) => r.target).map((r) => `${r.target}|${r.operator}|${r.value}`))).toBe(
        true,
      );
      const modifiers = await ModifiersMethods.getEntityModifiers(draft.id, entityType, baseId);
      expect(modifiers.map((m) => m.target)).toEqual(expect.arrayContaining(contributions.map((c) => c.modifier)));
      expect(unique(modifiers.map((m) => `${m.target}|${m.value}|${m.operator}`))).toBe(true);
    });

    test("editing it in the fork gives the fork's copy both extensions' aptitudes, requirements and modifiers", async () => {
      const { session, draft, baseId, contributions } = await setupSiblings(entityType);
      await entity.edit(session, draft.id, baseId);
      const [snapshot] = await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id });
      const copyId = snapshot.forkedEntityId;

      expect((await entity.links(copyId)).map((l) => l.aptitudeId)).toEqual(
        expect.arrayContaining(contributions.map((c) => c.aptitudeId)),
      );
      expect(
        (await Requirements.findManyByEntity(db, { entityIds: [copyId], entityType })).map((r) => r.target),
      ).toEqual(expect.arrayContaining(contributions.map((c) => c.requirement)));
      expect(
        (await Modifiers.findManyBySource(db, { sourceIds: [copyId], sourceType: entityType })).map((m) => m.target),
      ).toEqual(expect.arrayContaining(contributions.map((c) => c.modifier)));
    });
  });

  test("editing the feat keeps an extension's either-or requirement as its own group", async () => {
    // Regression: the losing sibling's OR chain was lifted into the copy's AND,
    // or merged into another OR group: both change who qualifies.
    const { session, draft, baseId, contributions } = await setupSiblings("feats");
    // Find which extension's copy wins, then undo that trial copy.
    await ENTITIES.feats.edit(session, draft.id, baseId);
    const [trial] = await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id });
    await Feats.delete(db, { id: trial.forkedEntityId });
    await EntitySnapshots.deleteBySourceAndRuleset(db, { sourceEntityId: trial.sourceEntityId, rulesetId: draft.id });
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
    const [snapshot] = await EntitySnapshots.findByRulesetId(db, { rulesetId: draft.id });
    const requirements = await Requirements.findManyByEntity(db, {
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
    invalidateAllCowData();
    const cow = await getOrBuildCowData((await Rulesets.findOne(db, { id: draft.id }))!);
    const winner = cow.overrideMap.get(baseId)!;
    const loser = contributions.map((c) => c.copyId).find((id) => id !== winner)!;
    expect((cow.siblingMap.get(winner) ?? []).filter((id) => id === loser)).toHaveLength(1);
  });
});
