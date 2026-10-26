import { describe, expect, test } from "bun:test";

import { eq, type InferInsertModel, sql } from "drizzle-orm";

import {
  DND35_COMPLETE_ADVENTURER_NAME,
  DND35_COMPLETE_ARCANE_NAME,
  DND35_COMPLETE_DIVINE_NAME,
  DND35_COMPLETE_WARRIOR_NAME,
  DND35_DMG_NAME,
} from "@/content/dnd3.5/rulesetNames.ts";
import { entitySnapshotsInRules, type rulesetsInRules } from "@/drizzle/schema.ts";
import {
  type Aptitude,
  type Feat,
  type Item,
  type Klass,
  type KlassLevel,
  type Language,
  type Mechanic,
  type Race,
  type RulesetAbility,
  type RulesetSave,
  type Skill,
  type Spell,
} from "@/engine/rulesets/dnd3.5/index.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { EntityEdit, RulesetViews } from "@/server/cow/index.ts";
import { db, withTransaction } from "@/server/database/index.ts";
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableEntityError } from "@/server/errors/index.ts";
import { fetchEveryPage } from "@/server/repositories/concerns/Paginates.ts";
import {
  CharacterAdvancements,
  CharacterInventory,
  CharacterLinks,
  Characters,
  Entities,
  EntityReferences,
  EntitySnapshots,
  Modifiers,
  Requirements,
  RulesetEntities,
  type RulesetEntityType,
  RulesetExtensions,
  Rulesets,
} from "@/server/repositories/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { ModifiersService } from "@/server/services/rulesets/customization/modifiers/index.ts";
import { RequirementsService } from "@/server/services/rulesets/customization/requirements/index.ts";
import { EntitiesService } from "@/server/services/rulesets/entities/index.ts";
import { RulesetExtensionsService } from "@/server/services/rulesets/extensions/index.ts";
import { RulesetsService } from "@/server/services/rulesets/index.ts";
import type { Session } from "@/shared/relations.ts";
import { expectRefusedWith } from "@/tests/support/api.ts";
import { findLinks } from "@/tests/support/characters.ts";
import { buildAs, createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { STRENGTH_BONUS } from "@/tests/support/dnd3.5/customizations.ts";
import { levelUpPlan } from "@/tests/support/dnd3.5/levelPlans.ts";
import {
  addCharacterLevel,
  addOneLevel,
  createTestKlassLevel,
  findKlassLevel,
  findPicks,
  pickFeat,
} from "@/tests/support/dnd3.5/levels.ts";
import {
  addBaseBonuses,
  addClassSkills,
  addGrants,
  addLists,
  findGrants,
  findLists,
} from "@/tests/support/dnd3.5/links.ts";
import { rawLists } from "@/tests/support/dnd3.5/rawLists.ts";
import { getPlanAnswer, getStepOptions, stepAnswerOf } from "@/tests/support/levels.ts";
import {
  copyEntity,
  createSeededTestRulesetWithExtensions,
  createTestRuleset,
  type Described,
  editRuleset,
  invalidateSeededRuleset,
} from "@/tests/support/rulesets.ts";
import { findPlainItem, findSeededRuleset, getSeedCtx, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import {
  CLASS_HD,
  ITEM_IS_TEMPLATE,
  ITEM_SLOT,
  ITEM_TYPE,
  LANGUAGE_TYPE,
  RACE_BASE_SPEED,
  RACE_SIZE,
} from "@/vocabulary/dnd3.5/fields/index.ts";

type EntityType = "feats" | "spells";

type RulesetValues = Partial<InferInsertModel<typeof rulesetsInRules>>;
const firstPage = { limit: 50, page: 1 };
const ENTITIES = {
  feats: {
    name: "Toughness",
    links: (id: string) => findLists(db, [id]),
    link: (id: string, aptitudeId: string) => addLists(db, "feats", id, [{ aptitudeId }]),
    get: async (rulesetId: string, id: string) =>
      await EntitiesService.getEntity<Described<"feats">>(rulesetId, "feats", id),
    list: async (rulesetId: string, search: string) =>
      (await EntitiesService.getEntities<Described<"feats">>(rulesetId, "feats", { search }, firstPage)).items,
    edit: (session: Session, rulesetId: string, id: string) =>
      EntitiesService.updateEntity(session, rulesetId, "feats", id, { name: "Toughness", description: "Mine" }),
  },
  spells: {
    name: "Cure Light Wounds",
    links: (id: string) => findLists(db, [id]),
    link: (id: string, aptitudeId: string) => addLists(db, "spells", id, [{ aptitudeId, level: 1 }]),
    get: async (rulesetId: string, id: string) =>
      await EntitiesService.getEntity<Described<"spells">>(rulesetId, "spells", id),
    list: async (rulesetId: string, search: string) =>
      (await EntitiesService.getEntities<Described<"spells">>(rulesetId, "spells", { search }, firstPage)).items,
    edit: (session: Session, rulesetId: string, id: string) =>
      EntitiesService.updateEntity(session, rulesetId, "spells", id, {
        name: "Cure Light Wounds",
        description: "Mine",
      }),
  },
};

/** What names what among `createNamingEntities`' entities. */
const NAMINGS = [
  ["item", "template"],
  ["subrace", "race"],
  ["spell", "save"],
  ["feat", "list"],
  ["klass", "save"],
  ["klass", "feat"],
  ["klass", "list"],
  ["klass", "skill"],
  ["subclass", "klass"],
] as const;

/** Add Level's plan of a first level of class `klassId`. */
function firstLevelOf(klassId: string) {
  return levelUpPlan([{ klassId, level: 1, hp: 1 }]);
}

function unique(keys: string[]) {
  return new Set(keys).size === keys.length;
}

/** A character of the user's on the ruleset, every ability score 16. */
async function createCharacterOn(userId: string, rulesetId: string) {
  const { abilityMap } = await getSeedCtx();
  const character = await createTestCharacter(userId, { rulesetId });
  await CharacterLinks.createMany(
    db,
    character.id,
    "score",
    Object.values(abilityMap).map((entityId) => ({ entityId, amount: 16 })),
  );
  return character;
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
 * An extension's entities that name each other, by what they are, each after those it names: an item and its template,
 * a race and its parent, a class and its parent, a spell and its save, a class whose first level gives the save and
 * grants a feat from a list the feat is on, and which has a class skill.
 */
async function createNamingEntities(rulesetId: string) {
  const { abilityMap } = await getSeedCtx();
  const name = (kind: string) => `${kind} ${uniqueId()}`;
  const [template] = await Entities.create<Item>(db, "items", {
    name: name("Blade"),
    rulesetId,
    fields: { [ITEM_TYPE]: "Weapon", [ITEM_IS_TEMPLATE]: true },
  });
  const [item] = await Entities.create<Item>(db, "items", {
    name: name("Flame Blade"),
    rulesetId,
    fields: { [ITEM_TYPE]: "Weapon" },
    links: { madeFrom: template.id },
  });
  const [race] = await Entities.create<Race>(db, "races", {
    name: name("Kin"),
    rulesetId,
    fields: { [RACE_SIZE]: "Small", [RACE_BASE_SPEED]: 20 },
  });
  const [subrace] = await Entities.create<Race>(db, "races", {
    name: name("Deep Kin"),
    rulesetId,
    fields: { [RACE_SIZE]: "Small", [RACE_BASE_SPEED]: 20 },
    links: { subraceOf: race.id },
  });
  const [save] = await Entities.create<RulesetSave>(db, "saves", {
    name: name("Luck Save"),
    rulesetId,
    links: { keyAbility: abilityMap["Charisma"] },
  });
  const [spell] = await Entities.create<Spell>(db, "spells", {
    name: name("Fortune"),
    rulesetId,
    links: { resistedBy: save.id },
  });
  const [skill] = await Entities.create<Skill>(db, "skills", {
    name: name("Gambling"),
    rulesetId,
    links: { keyAbility: abilityMap["Charisma"] },
  });
  const [list] = await Entities.create<Aptitude>(db, "aptitudes", { name: name("Luck Feats"), rulesetId });
  const [feat] = await Entities.create<Feat>(db, "feats", { name: name("Lucky"), rulesetId });
  await addLists(db, "feats", feat.id, [{ aptitudeId: list.id }]);
  const { klass, klassLevel } = await createTestKlassLevel(rulesetId);
  await addBaseBonuses(db, klassLevel.id, [{ saveId: save.id, base: 2 }]);
  await addGrants(db, klassLevel.id, "feats", [{ toId: feat.id, aptitudeId: list.id }]);
  await addClassSkills(db, klass.id, [skill.id]);
  const [subclass] = await Entities.create<Klass>(db, "classes", {
    name: name("Gambler"),
    rulesetId,
    fields: { [CLASS_HD]: 6 },
    links: { subclassOf: klass.id },
  });
  return {
    template: ["items", template.id],
    item: ["items", item.id],
    race: ["races", race.id],
    subrace: ["races", subrace.id],
    save: ["saves", save.id],
    spell: ["spells", spell.id],
    skill: ["skills", skill.id],
    list: ["aptitudes", list.id],
    feat: ["feats", feat.id],
    klass: ["classes", klass.id],
    subclass: ["classes", subclass.id],
  } satisfies Record<string, [RulesetEntityType, string]>;
}

/**
 * A favored soul's first level on a fork taking the DMG, Complete Warrior and Complete Divine, in that order: the
 * favored soul's list, as its level-up offers it, composes as Complete Warrior's copy.
 */
async function favoredSoulOnMixedFork() {
  const fork = await forkTaking(DND35_DMG_NAME, DND35_COMPLETE_WARRIOR_NAME, DND35_COMPLETE_DIVINE_NAME);
  const divine = await findSeededRuleset(DND35_COMPLETE_DIVINE_NAME);
  const favoredSoul = (await Entities.findOne<Klass>(db, {
    entityType: "classes",
    name: "Favored Soul",
    rulesetId: divine.id,
  }))!;
  const pools = await spellPoolsAt(fork.session, fork.character.id, favoredSoul.id);
  const list = Object.values(pools).find((pool) => pool.name === "Favored Soul Spells")!;
  const offer = ({ spellLevel, search }: { search: string; spellLevel?: number }) =>
    getStepOptions(
      fork.session,
      fork.character.id,
      "spells",
      firstLevelOf(favoredSoul.id),
      { pool: list.id, ...(spellLevel !== undefined && { tier: String(spellLevel) }) },
      { ...firstPage, search },
    );
  return { ...fork, favoredSoul, list, offer };
}

/** The fork's visible feats of this name. */
async function featsNamed(rulesetId: string, name: string) {
  return (
    await EntitiesService.getEntities<Described<"feats">>(rulesetId, "feats", { search: name }, firstPage)
  ).items.filter((f) => f.name === name);
}

/**
 * A page of the feats Add Level's picker offers a character on a first level of class `klassId`, in pool `pool`,
 * searched: a family's rows grouped, a family's one match named as its feat.
 */
async function featsOffered(session: Session, characterId: string, klassId: string, pool: string, search: string) {
  return await getStepOptions(session, characterId, "feats", firstLevelOf(klassId), { pool }, { ...firstPage, search });
}

/** What names what among these entities in a ruleset (`EntityReferences.findMany`), by their ids. */
async function findNamings(rulesetId: string, entityIds: string[]) {
  const references = await EntityReferences.findMany(db, { rulesetId, entityIds });
  return references.map(({ id, targetId }) => `${id} names ${targetId}`).toSorted();
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

  return { session, draft, character: await createCharacterOn(user.id, draft.id) };
}

/**
 * A level a new character of the user's took on the ruleset, in a class of the ruleset's own, picking this entity from
 * this list.
 */
async function levelPicking(userId: string, rulesetId: string, type: EntityType, entityId: string, aptitudeId: string) {
  const character = await createTestCharacter(userId, { rulesetId });
  const { klassLevel } = await createTestKlassLevel(rulesetId);
  return await addCharacterLevel(character.id, klassLevel.id, { [type]: { [aptitudeId]: [entityId] } });
}

/** A level's picks of a type, each by the entity it names and the list it's from. */
async function picksOf(type: EntityType, characterLevelId: string) {
  return (await findPicks(type, [characterLevelId])).map(({ entityId, viaId }) => ({ entityId, aptitudeId: viaId }));
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
  const { featMap, spellMap } = await getSeedCtx();
  const baseId = entityType === "feats" ? featMap[entity.name] : spellMap[entity.name];
  const contributions = [];
  const extensions = [];
  for (const ability of ["strength", "wisdom"]) {
    const extension = await createExtension();
    const copyId = (await copyEntity(db, entityType, baseId, extension)).id as string;
    const [aptitude] = await Entities.create<Aptitude>(db, "aptitudes", {
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

/** The spell pools a first level of class `klassId` plans the character, as Add Level's plan answers them. */
async function spellPoolsAt(session: Session, characterId: string, klassId: string) {
  const answer = await getPlanAnswer(session, characterId, firstLevelOf(klassId));
  return stepAnswerOf(answer, "spells", "pick").pools;
}

/** Complete Warrior's own feat or spell of this name: its copy of a core one, or one only the book has. */
async function warriorEntity(type: EntityType, name: string) {
  const { id: rulesetId } = await findSeededRuleset(DND35_COMPLETE_WARRIOR_NAME);
  const entity =
    type === "feats"
      ? await Entities.findOne<Feat>(db, { entityType: "feats", name, rulesetId })
      : await Entities.findOne<Spell>(db, { entityType: "spells", name, rulesetId });
  return entity!.id;
}

/** A seeded Complete Warrior feat, with the aptitude it's picked through. */
async function warriorFeat(name: string) {
  const extension = await findSeededRuleset(DND35_COMPLETE_WARRIOR_NAME);
  const feat = (await Entities.findOne<Feat>(db, { entityType: "feats", name, rulesetId: extension.id }))!;
  const [link] = await findLists(db, [feat.id]);
  return { ...feat, aptitudeId: link.toId };
}

describe("subscribing to an extension", () => {
  test("adds its content to the fork without copying it, and records the subscription", async () => {
    const { session, extension, draft } = await setupFork();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);

    expect((await Rulesets.findOne(db, { id: draft.id }))!.extensionRulesetIds).toEqual([extension.id]);
    const trooper = await warriorFeat("Shock Trooper");
    expect(await EntitiesService.getEntity<Described<"feats">>(draft.id, "feats", trooper.id)).toMatchObject({
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

  test("adds the extension's feats to the fork's: Complete Warrior brings 514 of its own", async () => {
    const { session, extension, draft } = await setupFork();
    const total = async () => {
      const { extensionRulesetIds, ancestorRulesetIds } = (await Rulesets.findOne(db, { id: draft.id }))!;
      const sourceChain = [...extensionRulesetIds, ...ancestorRulesetIds];
      return (
        await fetchEveryPage((page) =>
          Entities.findPage<Feat>(
            db,
            { entityType: "feats", rulesetId: draft.id, ancestorRulesetIds: sourceChain },
            page,
          ),
        )
      ).length;
    };
    const before = await total();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    // 535 feats, 21 of which override a base feat.
    expect(await total()).toBe(before + 514);
  });

  test("takes several extensions, system or published by users, on a draft or a published fork", async () => {
    const { user, session, extension, draft } = await setupFork();
    const [systemExtension, homebrew] = [await createExtension(), await createExtension(user.id)];
    await Entities.create<Feat>(db, "feats", { name: "Homebrew Feat", rulesetId: homebrew.id });
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
    expect(subscribe(extension.id, session, archived.id)).rejects.toThrow(UnprocessableEntityError);
    expect(subscribe(extension.id, other)).rejects.toThrow(ForbiddenError);
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
    expect(RulesetExtensionsService.subscribeExtension(other, homebrew.id, [extension.id])).rejects.toThrow(
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
    expect(
      RulesetExtensionsService.subscribeExtension(session, (await forkBase(session)).id, [homebrew.id]),
    ).rejects.toThrow(UnprocessableEntityError);
  });

  describe("names", () => {
    test("refuses a name the fork already uses, or that two extensions share in content that can't be merged", async () => {
      const { user, session, draft } = await setupFork();
      const extension = await createExtension(user.id);
      await Entities.create<Feat>(db, "feats", { name: "Clash", rulesetId: extension.id });
      await Entities.create<Feat>(db, "feats", { name: "Clash", rulesetId: draft.id });
      expect(RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id])).rejects.toThrow(
        'Cannot subscribe: feats "Clash" already exists in this ruleset or another subscribed extension',
      );

      // Only feats and spells merge; two races of one name would show twice.
      const [raceA, raceB] = [await createExtension(), await createExtension()];
      for (const { id } of [raceA, raceB]) {
        await Entities.create<Race>(db, "races", {
          name: "Tiefling",
          rulesetId: id,
          fields: { [RACE_SIZE]: "Medium", [RACE_BASE_SPEED]: 30 },
        });
      }
      await expectRefusedWith(
        RulesetExtensionsService.subscribeExtension(session, draft.id, [raceA.id, raceB.id]),
        409,
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
        await Entities.create<Feat>(db, "feats", { name: "Shared Feat", rulesetId: id });
        await Entities.create<Aptitude>(db, "aptitudes", { name: "Shared Aptitude", rulesetId: id });
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
      const [[spellA], [spellB], [baseSpell], [reprint]] = [
        await Entities.create<Spell>(db, "spells", { name: "Forestfold", rulesetId: a.id }),
        await Entities.create<Spell>(db, "spells", { name: "Forestfold", rulesetId: b.id }),
        await Entities.create<Spell>(db, "spells", { name: "Reprint", rulesetId }),
        await Entities.create<Spell>(db, "spells", { name: "Reprint", rulesetId: a.id }),
      ];
      await RulesetExtensionsService.subscribeExtension(session, draft.id, [a.id, b.id]);
      RulesetViews.invalidate(draft.id);
      const cow = await RulesetViews.getCowData((await Rulesets.findOne(db, { id: draft.id }))!);

      const [winner, loser] = cow.hasSiblings(spellA.id) ? [spellA, spellB] : [spellB, spellA];
      expect(cow.getSiblings(winner.id)).toContain(loser.id);
      expect(cow.resolve(loser.id)).toBe(winner.id);
      expect(cow.siblingIds.has(loser.id)).toBe(true);

      expect(cow.getSiblings(reprint.id)).toContain(baseSpell.id);
      expect(cow.resolve(baseSpell.id)).toBe(reprint.id);
      expect(cow.getStaleIds()).not.toContain(reprint.id);
    });

    test("pairs the fork's own list with its books' lists of its name: the fork's shows, its books' classes drawing on it", async () => {
      const { user, session, draft } = await setupFork();
      const [own] = await Entities.create<Aptitude>(db, "aptitudes", {
        name: "Favored Soul Spells",
        rulesetId: draft.id,
      });
      const divine = await findSeededRuleset(DND35_COMPLETE_DIVINE_NAME);
      await RulesetExtensionsService.subscribeExtension(session, draft.id, [divine.id]);
      const view = await RulesetViews.getData((await Rulesets.findOne(db, { id: draft.id }))!);
      const dnd35 = Dnd35View.of(view);
      const divineList = (await Entities.findOne<Aptitude>(db, {
        entityType: "aptitudes",
        name: own.name,
        rulesetId: divine.id,
      }))!;
      const named = (lists: { id: string; name: string }[]) =>
        lists.filter((list) => list.name === own.name).map((list) => list.id);
      expect(named([...dnd35.aptitudesById.values()])).toEqual([own.id]);
      expect(dnd35.aptitudesById.get(divineList.id)?.id).toBe(own.id);
      const { items } = await EntitiesService.getEntities(draft.id, "aptitudes", { search: own.name }, firstPage);
      expect(named(items)).toEqual([own.id]);

      // The book's favored soul casts from the fork's list, which offers the spells on the book's
      const divineRows = rawLists(await RulesetViews.getRawData(divine.id));
      const spell = divineRows.spells.find((spell) =>
        divineRows.spellLists.some(
          (link) => link.fromId === spell.id && link.toId === divineList.id && link.tier === 1,
        ),
      )!;
      const character = await createCharacterOn(user.id, draft.id);
      const favoredSoul = (await Entities.findOne<Klass>(db, {
        entityType: "classes",
        name: "Favored Soul",
        rulesetId: divine.id,
      }))!;
      const pools = await spellPoolsAt(session, character.id, favoredSoul.id);
      expect(named(Object.values(pools))).toEqual([own.id]);
      const offered = await getStepOptions(
        session,
        character.id,
        "spells",
        firstLevelOf(favoredSoul.id),
        { pool: own.id },
        { ...firstPage, search: spell.name },
      );
      expect(offered.items.map((spell) => spell.id)).toContain(dnd35.spellsById.get(spell.id)!.id);
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

      const copy = await EntitiesService.updateEntity(session, draft.id, "feats", toughness, {
        name: "Toughness",
        description: "Mine",
      });
      await RulesetExtensionsService.subscribeExtension(session, draft.id, [a.id, b.id]);

      expect(await featsNamed(draft.id, "Toughness")).toHaveLength(1);
      // A pick saved with the extension's copy reaches the fork's, whose customizations stay its own.
      const reached = await EntitiesService.getEntity<Described<"feats">>(draft.id, "feats", extensionCopy);
      expect(reached.id).toBe(copy.id);
      expect(reached.modifiers.map((m) => m.target)).not.toContain("abilities.constitution.total");
    });

    test("and when it copies the feat after subscribing", async () => {
      const { user, session, draft } = await setupFork();
      const { featMap } = await getSeedCtx();
      const [a, b] = [await createExtension(user.id), await createExtension(user.id)];
      for (const extension of [a, b]) await copyEntity(db, "feats", featMap["Toughness"], extension);
      await RulesetExtensionsService.subscribeExtension(session, draft.id, [a.id, b.id]);
      await EntitiesService.updateEntity(session, draft.id, "feats", featMap["Toughness"], {
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
    await EntitiesService.updateEntity(session, draft.id, "feats", monkeyGrip.id, {
      name: "Monkey Grip",
      description: "Mine",
    });

    expect(await RulesetExtensionsService.unsubscribeExtension(session, draft.id, extension.id)).toEqual({
      unsubscribed: true,
    });
    expect((await Rulesets.findOne(db, { id: draft.id }))!.extensionRulesetIds).toEqual([]);
    expect(await featsNamed(draft.id, "Monkey Grip")).toEqual([]);
    await expectRefusedWith(EntitiesService.getEntity<Described<"feats">>(draft.id, "feats", monkeyGrip.id), 404);
    expect(await EntitySnapshots.findMany(db, { rulesetId: draft.id })).toEqual([]);
    expect(await RulesetExtensions.findMany(db, { rulesetId: draft.id })).toEqual([]);

    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    expect(
      (await EntitiesService.getEntities<Described<"feats">>(draft.id, "feats", { search: "Monkey Grip" }, firstPage))
        .items,
    ).toMatchObject([{ id: monkeyGrip.id, rulesetId: extension.id }]);
    expect(await RulesetExtensions.findMany(db, { rulesetId: draft.id })).toHaveLength(1);
  });

  test("repoints the fork's links and class grants from its lists to the lists of their names it keeps", async () => {
    const { session, extension: warrior, draft } = await setupFork();
    const dmg = await findSeededRuleset(DND35_DMG_NAME);
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [warrior.id, dmg.id]);
    const subscribed = await RulesetViews.getData((await Rulesets.findOne(db, { id: draft.id }))!);
    const lists = [...Dnd35View.of(subscribed).aptitudesById.values()];
    const warriorAssassin = lists.find((list) => list.name === "Assassin Spells")!;
    expect(warriorAssassin.rulesetId).toBe(warrior.id);
    const wizard = lists.find((list) => list.name === "Wizard Spells")!;
    const [spell] = await Entities.create<Spell>(db, "spells", { name: `Probe ${uniqueId()}`, rulesetId: draft.id });
    await addLists(db, "spells", spell.id, [
      { aptitudeId: warriorAssassin.id, level: 2 },
      { aptitudeId: wizard.id, level: 3 },
    ]);
    const { klassLevel } = await createTestKlassLevel(draft.id);
    await addGrants(db, klassLevel.id, "spells", [{ toId: spell.id, aptitudeId: warriorAssassin.id }]);
    RulesetViews.invalidate(draft.id);

    await RulesetExtensionsService.unsubscribeExtension(session, draft.id, warrior.id);
    const after = await RulesetViews.getData((await Rulesets.findOne(db, { id: draft.id }))!);
    const afterView = Dnd35View.of(after);
    const dmgAssassin = [...afterView.aptitudesById.values()].find((list) => list.name === "Assassin Spells")!;
    expect(dmgAssassin.rulesetId).toBe(dmg.id);
    expect((await findLists(db, [spell.id])).map(({ tier, toId }) => ({ aptitudeId: toId, level: tier }))).toEqual(
      expect.arrayContaining([
        { aptitudeId: dmgAssassin.id, level: 2 },
        { aptitudeId: wizard.id, level: 3 },
      ]),
    );
    expect(afterView.listSpellIds({ aptitudeId: dmgAssassin.id })).toContain(spell.id);
    expect(await findGrants(db, [klassLevel.id], "spells")).toMatchObject([{ toId: spell.id, viaId: dmgAssassin.id }]);
  });

  test("repoints a copied spell's merged links to the lists of their names the fork's other books have", async () => {
    const { user, session } = await createTestUser();
    const fork = await createSeededTestRulesetWithExtensions(user.id);
    const warrior = await findSeededRuleset(DND35_COMPLETE_WARRIOR_NAME);
    const view = await RulesetViews.getData(fork);
    // Alter Self's copies merge in Complete Warrior's lists, its Assassin Spells the winner of the books' namesakes
    const alterSelf = [...Dnd35View.of(view).spellsById.values()].find((spell) => spell.name === "Alter Self")!;
    const { id: copyId } = await withTransaction(async (tx) =>
      (await editRuleset(EntityEdit, fork)).cowToEdit(tx, "spells", alterSelf),
    );

    await RulesetExtensionsService.unsubscribeExtension(session, fork.id, warrior.id);
    const after = await RulesetViews.getData((await Rulesets.findOne(db, { id: fork.id }))!);
    const afterView = Dnd35View.of(after);
    const links = await findLists(db, [copyId]);
    expect(links.filter((link) => !afterView.aptitudesById.has(link.toId))).toEqual([]);
    const assassin = [...afterView.aptitudesById.values()].find((list) => list.name === "Assassin Spells")!;
    expect(assassin.rulesetId).not.toBe(warrior.id);
    expect(afterView.listSpellIds({ aptitudeId: assassin.id })).toContain(copyId);
  });

  test("refuses to leave a link to a list no other book has, naming it, and changes nothing", async () => {
    const { session, extension: warrior, draft } = await setupFork();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [warrior.id]);
    const subscribed = await RulesetViews.getData((await Rulesets.findOne(db, { id: draft.id }))!);
    const lists = [...Dnd35View.of(subscribed).aptitudesById.values()];
    const warriorOnly = lists.find(
      (list) => list.rulesetId === warrior.id && !lists.some((other) => other !== list && other.name === list.name),
    )!;
    const [spell] = await Entities.create<Spell>(db, "spells", { name: `Probe ${uniqueId()}`, rulesetId: draft.id });
    await addLists(db, "spells", spell.id, [{ aptitudeId: warriorOnly.id, level: 1 }]);

    expect(RulesetExtensionsService.unsubscribeExtension(session, draft.id, warrior.id)).rejects.toThrow(
      `${warriorOnly.name}, a list no other book of this ruleset has`,
    );
    expect((await Rulesets.findOne(db, { id: draft.id }))!.extensionRulesetIds).toEqual([warrior.id]);
    expect(await findLists(db, [spell.id])).toMatchObject([{ toId: warriorOnly.id }]);
  });

  test("points the fork's links and its characters' picks from its list at the fork's own list of its name", async () => {
    const { user, session, extension: warrior, draft } = await setupFork();
    const [own] = await Entities.create<Aptitude>(db, "aptitudes", { name: "Assassin Spells", rulesetId: draft.id });
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [warrior.id]);
    const warriorList = (await Entities.findOne<Aptitude>(db, {
      entityType: "aptitudes",
      name: own.name,
      rulesetId: warrior.id,
    }))!;
    // Rows naming the book's list, as a fork's spell and a character's pick could name it while both lists showed
    const [spell] = await Entities.create<Spell>(db, "spells", { name: `Probe ${uniqueId()}`, rulesetId: draft.id });
    await addLists(db, "spells", spell.id, [{ aptitudeId: warriorList.id, level: 1 }]);
    const level = await levelPicking(user.id, draft.id, "spells", spell.id, warriorList.id);

    expect(await RulesetExtensionsService.unsubscribeExtension(session, draft.id, warrior.id)).toEqual({
      unsubscribed: true,
    });
    expect(await findLists(db, [spell.id])).toMatchObject([{ toId: own.id }]);
    expect(await picksOf("spells", level.id)).toEqual([{ entityId: spell.id, aptitudeId: own.id }]);
  });

  test("refuses to leave a class's grant of the extension's feat", async () => {
    const { session, extension: warrior, draft } = await setupFork();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [warrior.id]);
    const monkeyGrip = await warriorFeat("Monkey Grip");
    const { klassLevel } = await createTestKlassLevel(draft.id);
    const general = (await Entities.findOne<Aptitude>(db, {
      entityType: "aptitudes",
      rulesetId: draft.ancestorRulesetIds[0],
      name: "General",
    }))!;
    await addGrants(db, klassLevel.id, "feats", [{ toId: monkeyGrip.id, aptitudeId: general.id }]);

    expect(RulesetExtensionsService.unsubscribeExtension(session, draft.id, warrior.id)).rejects.toThrow(
      /, which uses Monkey Grip/,
    );
  });

  test("refuses to leave a row naming another of the extension's entities: a class's skill", async () => {
    const { user, session, draft } = await setupFork();
    const extension = await createExtension(user.id);
    const strength = (await Entities.findOne<RulesetAbility>(db, {
      entityType: "abilities",
      rulesetId: draft.ancestorRulesetIds[0],
      name: "Strength",
    }))!;
    const [skill] = await Entities.create<Skill>(db, "skills", {
      name: `Probe Skill ${uniqueId()}`,
      rulesetId: extension.id,
      links: { keyAbility: strength.id },
    });
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    const [klass] = await Entities.create<Klass>(db, "classes", {
      name: `Probe Class ${uniqueId()}`,
      rulesetId: draft.id,
      fields: { [CLASS_HD]: 8 },
    });
    await addClassSkills(db, klass.id, [skill.id]);

    expect(RulesetExtensionsService.unsubscribeExtension(session, draft.id, extension.id)).rejects.toThrow(
      `${klass.name}, which uses ${skill.name}`,
    );
  });

  test("keeps the other extensions and the fork's copies of theirs", async () => {
    const { session, extension, draft } = await setupFork();
    const other = await createExtension();
    const [otherFeat] = await Entities.create<Feat>(db, "feats", { name: "Other Feat", rulesetId: other.id });
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id, other.id]);
    const copy = await EntitiesService.updateEntity(session, draft.id, "feats", otherFeat.id, {
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
    const [baseMechanic] = await Entities.create<Mechanic>(db, "mechanics", {
      name: name("Grapple"),
      rulesetId: ctx.rulesetId,
    });
    invalidateSeededRuleset(ctx.rulesetId);
    const fromBase = [
      ["abilities", ctx.abilityMap["Strength"]],
      ["saves", ctx.saveMap["Fortitude"]],
      ["skills", ctx.skillMap["Climb"]],
      ["feats", ctx.featMap["Toughness"]],
      ["spells", ctx.spellMap["Magic Missile"]],
      ["items", ctx.itemMap["Longsword"]],
      ["races", ctx.raceMap.pc["Human"]],
      ["languages", ctx.langMap["Elven"]],
      ["classes", ctx.klassMap.pc["Fighter"]],
      ["aptitudes", ctx.aptMap["General"]],
      ["mechanics", baseMechanic.id],
    ] as const;

    // An extension adds every kind but abilities, which only the core rules define
    const rulesetId = extension.id;
    const charisma = ctx.abilityMap["Charisma"];
    const fromExtension = [
      [
        "saves",
        (
          await Entities.create<RulesetSave>(db, "saves", {
            name: name("Luck Save"),
            rulesetId,
            links: { keyAbility: charisma },
          })
        )[0].id,
      ],
      [
        "skills",
        (
          await Entities.create<Skill>(db, "skills", {
            name: name("Gambling"),
            rulesetId,
            links: { keyAbility: charisma },
          })
        )[0].id,
      ],
      ["feats", (await Entities.create<Feat>(db, "feats", { name: name("Lucky"), rulesetId }))[0].id],
      ["spells", (await Entities.create<Spell>(db, "spells", { name: name("Fortune"), rulesetId }))[0].id],
      [
        "items",
        (
          await Entities.create<Item>(db, "items", { name: name("Charm"), rulesetId, fields: { [ITEM_SLOT]: "Neck" } })
        )[0].id,
      ],
      [
        "races",
        (
          await Entities.create<Race>(db, "races", {
            name: name("Halfling Kin"),
            rulesetId,
            fields: { [RACE_SIZE]: "Small", [RACE_BASE_SPEED]: 20 },
          })
        )[0].id,
      ],
      [
        "languages",
        (
          await Entities.create<Language>(db, "languages", {
            name: name("Cant"),
            rulesetId,
            fields: { [LANGUAGE_TYPE]: "Secret" },
          })
        )[0].id,
      ],
      [
        "classes",
        (
          await Entities.create<Klass>(db, "classes", { name: name("Gambler"), rulesetId, fields: { [CLASS_HD]: 6 } })
        )[0].id,
      ],
      ["aptitudes", (await Entities.create<Aptitude>(db, "aptitudes", { name: name("Luck Feats"), rulesetId }))[0].id],
      ["mechanics", (await Entities.create<Mechanic>(db, "mechanics", { name: name("Wager"), rulesetId }))[0].id],
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

  test.each(["named", "naming"])(
    "removes the fork's copies that name each other, the %s ones first: a template, a parent, a save, a class's skill, grant and list",
    async (first) => {
      const { user, session, draft } = await setupFork();
      const extension = await createExtension(user.id);
      const entities = await createNamingEntities(extension.id);
      await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
      // Each copy names the copies made before it (`EntityCopy` remaps them): a named entity is copied first
      const copies = new Map<string, string>();
      for (const [type, id] of Object.values(entities))
        copies.set(id, (await copyEntity(db, type, id, { ...draft, extensionRulesetIds: [extension.id] })).id);
      const copyOf = (id: string) => copies.get(id)!;
      const namingsOf = (idOf: (id: string) => string) =>
        NAMINGS.map(([from, to]) => `${idOf(entities[from][1])} names ${idOf(entities[to][1])}`).toSorted();
      expect(await findNamings(draft.id, [...copies.values()])).toEqual(namingsOf(copyOf));
      // The unsubscribe takes the copies in the order of their snapshots
      const order = first === "named" ? [...copies.keys()] : [...copies.keys()].toReversed();
      for (const [index, sourceEntityId] of order.entries()) {
        await db
          .update(entitySnapshotsInRules)
          .set({ createdAt: sql`${entitySnapshotsInRules.createdAt} + ${index} * interval '1 second'` })
          .where(eq(entitySnapshotsInRules.sourceEntityId, sourceEntityId));
      }

      expect(await RulesetExtensionsService.unsubscribeExtension(session, draft.id, extension.id)).toEqual({
        unsubscribed: true,
      });
      expect(await EntitySnapshots.findMany(db, { rulesetId: draft.id })).toEqual([]);
      for (const [type, id] of Object.values(entities))
        expect(await RulesetEntities.findNames(db, type, { ids: [copyOf(id)] })).toEqual([]);
      expect(await findNamings(extension.id, [...copies.keys()])).toEqual(namingsOf((id) => id));
    },
  );

  test("is refused while a character picked its content, or the fork's copy of it, even an archived character", async () => {
    const { user, session, extension, draft } = await setupFork();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    const [monkeyGrip, trooper] = [await warriorFeat("Monkey Grip"), await warriorFeat("Shock Trooper")];
    // A character of the fork who picked nothing from the extension doesn't count.
    await createTestCharacter(user.id, { rulesetId: draft.id });

    const direct = await pickFeat(user.id, draft.id, monkeyGrip.id, monkeyGrip.aptitudeId);
    await Characters.archive(db, { id: direct.id });
    expect(RulesetExtensionsService.unsubscribeExtension(session, draft.id, extension.id)).rejects.toThrow(
      ConflictError,
    );
    await Characters.delete(db, { id: direct.id });

    const copy = await EntitiesService.updateEntity(session, draft.id, "feats", trooper.id, {
      name: "Shock Trooper",
      description: "Mine",
    });
    await pickFeat(user.id, draft.id, copy.id, trooper.aptitudeId);
    expect(RulesetExtensionsService.unsubscribeExtension(session, draft.id, extension.id)).rejects.toThrow(
      ConflictError,
    );
  });

  test.each([
    ["feats", "Spirited Charge", "General"],
    ["spells", "Bull's Strength", "Cleric Spells"],
  ] as const)(
    "keeps a character's pick of a core entity it overrides (%s: %s) as the core one, whichever id the pick names",
    async (type, name, list) => {
      const { user, session, extension: warrior, draft } = await setupFork();
      await RulesetExtensionsService.subscribeExtension(session, draft.id, [warrior.id]);
      const { aptMap, featMap, spellMap } = await getSeedCtx();
      const coreId = (type === "feats" ? featMap : spellMap)[name];
      const copyId = await warriorEntity(type, name);
      expect(copyId).not.toBe(coreId);
      const aptitudeId = aptMap[list];
      // A level-up writes the id the view shows, the book's copy; a pick made before subscribing names the core one
      const ofCopy = await levelPicking(user.id, draft.id, type, copyId, aptitudeId);
      const ofCore = await levelPicking(user.id, draft.id, type, coreId, aptitudeId);

      expect(await RulesetExtensionsService.unsubscribeExtension(session, draft.id, warrior.id)).toEqual({
        unsubscribed: true,
      });
      for (const level of [ofCopy, ofCore])
        expect(await picksOf(type, level.id)).toEqual([{ entityId: coreId, aptitudeId }]);
    },
  );

  test.each([
    ["a feat only it has", "feats", "Monkey Grip", "General"],
    ["a spell only it has", "spells", "Cloak of Bravery", "Cleric Spells"],
    ["a core spell it overrides, from a list only it has", "spells", "Bull's Strength", "Knight of the Chalice Spells"],
  ] as const)("is refused while a character picked %s", async (_, type, name, list) => {
    const { user, session, extension: warrior, draft } = await setupFork();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [warrior.id]);
    const aptitude =
      (await Entities.findOne<Aptitude>(db, {
        entityType: "aptitudes",
        name: list,
        rulesetId: draft.ancestorRulesetIds[0],
      })) ?? (await Entities.findOne<Aptitude>(db, { entityType: "aptitudes", name: list, rulesetId: warrior.id }))!;
    const level = await levelPicking(user.id, draft.id, type, await warriorEntity(type, name), aptitude.id);

    expect(RulesetExtensionsService.unsubscribeExtension(session, draft.id, warrior.id)).rejects.toThrow(
      "Cannot unsubscribe from extensions on a ruleset in use by characters",
    );
    expect(await picksOf(type, level.id)).toMatchObject([{ aptitudeId: aptitude.id }]);
  });

  test("points the fork's class granting a core feat it overrides at the core feat", async () => {
    const { session, extension: warrior, draft } = await setupFork();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [warrior.id]);
    const { aptMap, featMap } = await getSeedCtx();
    const { klassLevel } = await createTestKlassLevel(draft.id);
    const grant = { toId: await warriorEntity("feats", "Spirited Charge"), aptitudeId: aptMap["General"] };
    await addGrants(db, klassLevel.id, "feats", [grant]);

    await RulesetExtensionsService.unsubscribeExtension(session, draft.id, warrior.id);
    expect(await findGrants(db, [klassLevel.id])).toMatchObject([
      { toId: featMap["Spirited Charge"], viaId: aptMap["General"] },
    ]);
  });

  test("points what the fork and its characters keep naming a core race, item, language or skill it overrides at the core one, and no other ruleset's", async () => {
    const { user, session, draft } = await setupFork();
    const extension = await createExtension(user.id);
    const ctx = await getSeedCtx();
    const core = {
      race: ctx.raceMap.pc["Human"],
      item: (await findPlainItem(ctx.rulesetId)).id,
      language: ctx.langMap["Elven"],
      skill: ctx.skillMap["Climb"],
    };
    const copies = {
      race: (await copyEntity(db, "races", core.race, extension)).id,
      item: (await copyEntity(db, "items", core.item, extension)).id,
      language: (await copyEntity(db, "languages", core.language, extension)).id,
      skill: (await copyEntity(db, "skills", core.skill, extension)).id,
    };
    // A subrace of the copy in the fork and in the extension, and a character naming the copies on the fork and on
    // another fork of the user's taking the extension
    const subraceOf = async (rulesetId: string) =>
      (
        await Entities.create<Race>(db, "races", {
          name: `Deep Kin ${uniqueId()}`,
          rulesetId,
          fields: { [RACE_SIZE]: "Small", [RACE_BASE_SPEED]: 20 },
          links: { subraceOf: copies.race },
        })
      )[0];
    const characterOn = async (rulesetId: string) => {
      const character = await createTestCharacter(user.id, { rulesetId, raceId: copies.race });
      await CharacterInventory.create(db, { characterId: character.id, itemId: copies.item, quantity: 1 });
      await CharacterLinks.createMany(db, character.id, "speaks", [{ entityId: copies.language }]);
      const { klassLevel } = await createTestKlassLevel(rulesetId);
      const level = await addCharacterLevel(character.id, klassLevel.id, {
        skills: { [copies.skill]: 2 },
      });
      return { character, level };
    };
    const named = async ({ character, level }: Awaited<ReturnType<typeof characterOn>>) => ({
      race: (await Characters.findOne(db, { id: character.id }))!.links.race,
      item: (await CharacterInventory.findMany(db, { characterId: character.id }))[0].itemId,
      language: (await findLinks("speaks", character.id))[0].entityId,
      skill: (await findPicks("skills", [level.id]))[0].entityId,
    });
    const other = await forkBase(session);
    for (const fork of [draft, other])
      await RulesetExtensionsService.subscribeExtension(session, fork.id, [extension.id]);
    const [ownSubrace, extensionSubrace] = [await subraceOf(draft.id), await subraceOf(extension.id)];
    const [mine, theirs] = [await characterOn(draft.id), await characterOn(other.id)];

    await RulesetExtensionsService.unsubscribeExtension(session, draft.id, extension.id);
    expect(await named(mine)).toEqual(core);
    expect(await Entities.findOne<Race>(db, { entityType: "races", id: ownSubrace.id })).toMatchObject({
      links: { subraceOf: core.race },
    });
    expect(await named(theirs)).toEqual(copies);
    expect(await Entities.findOne<Race>(db, { entityType: "races", id: extensionSubrace.id })).toMatchObject({
      links: { subraceOf: copies.race },
    });
  });

  test("points a pick of the fork's copy of a core feat it overrides at the core feat, the copy going", async () => {
    const { user, session, extension: warrior, draft } = await setupFork();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [warrior.id]);
    const { aptMap, featMap } = await getSeedCtx();
    const mine = await EntitiesService.updateEntity(
      session,
      draft.id,
      "feats",
      await warriorEntity("feats", "Spirited Charge"),
      {
        name: "Spirited Charge",
        description: "Mine",
      },
    );
    const level = await levelPicking(user.id, draft.id, "feats", mine.id, aptMap["General"]);

    await RulesetExtensionsService.unsubscribeExtension(session, draft.id, warrior.id);
    expect(await picksOf("feats", level.id)).toEqual([
      { entityId: featMap["Spirited Charge"], aptitudeId: aptMap["General"] },
    ]);
    expect(await Entities.findOne<Feat>(db, { entityType: "feats", id: mine.id })).toBeUndefined();
    expect(await featsNamed(draft.id, "Spirited Charge")).toMatchObject([{ id: featMap["Spirited Charge"] }]);
  });

  test("points a pick of the copy of a feat two extensions override at the other one's, which wins once it's gone", async () => {
    const { session, draft, baseId, contributions } = await setupSiblings("feats");
    const general = (await getSeedCtx()).aptMap["General"];
    const winner = (await RulesetViews.getCowData((await Rulesets.findOne(db, { id: draft.id }))!)).resolve(baseId);
    expect(winner).not.toBe(baseId);
    const other = contributions.find((contribution) => contribution.copyId !== winner)!;
    const level = await levelPicking(session.userId, draft.id, "feats", winner, general);

    await RulesetExtensionsService.unsubscribeExtension(
      session,
      draft.id,
      (await Entities.findOne<Feat>(db, { entityType: "feats", id: winner }))!.rulesetId,
    );
    expect(await picksOf("feats", level.id)).toEqual([{ entityId: other.copyId, aptitudeId: general }]);
  });

  test("points a character's pick from its list at the list of that name another book has", async () => {
    const { user, session, extension: warrior, draft } = await setupFork();
    const dmg = await findSeededRuleset(DND35_DMG_NAME);
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [warrior.id, dmg.id]);
    const [warriorAssassin, dmgAssassin] = [
      (await Entities.findOne<Aptitude>(db, {
        entityType: "aptitudes",
        name: "Assassin Spells",
        rulesetId: warrior.id,
      }))!,
      (await Entities.findOne<Aptitude>(db, { entityType: "aptitudes", name: "Assassin Spells", rulesetId: dmg.id }))!,
    ];
    const spell = (await getSeedCtx()).spellMap["Magic Missile"];
    const level = await levelPicking(user.id, draft.id, "spells", spell, warriorAssassin.id);

    await RulesetExtensionsService.unsubscribeExtension(session, draft.id, warrior.id);
    expect(await picksOf("spells", level.id)).toEqual([{ entityId: spell, aptitudeId: dmgAssassin.id }]);
  });

  test("moves a character's level in a class it overrides to the class's level of its number, refused for a level or a class only it has", async () => {
    const { user, session } = await createTestUser();
    const parent = await createTestRuleset(null, { private: false, status: "Published" });
    const fork = { rulesetId: parent.id, ancestorRulesetIds: [parent.id] };
    const extension = await createTestRuleset(null, {
      ...fork,
      kind: "extension",
      private: false,
      status: "Published",
    });
    const draft = await createTestRuleset(user.id, fork);
    // A class of the parent's with one level, which the extension copied and gave a second, and a class of its own
    const [source] = await Entities.create<Klass>(db, "classes", {
      name: `Parent Class ${uniqueId()}`,
      rulesetId: parent.id,
      fields: { [CLASS_HD]: 8 },
    });
    const [sourceLevel] = await Entities.create<KlassLevel>(db, "class_levels", { ownerId: source.id, position: 1 });
    const copy = await copyEntity(db, "classes", source.id, extension);
    const [copyLevel] = await Entities.findMany<KlassLevel>(db, { entityType: "class_levels", ownerIds: [copy.id] });
    const [added] = await Entities.create<KlassLevel>(db, "class_levels", { ownerId: copy.id, position: 2 });
    const { klassLevel: own } = await createTestKlassLevel(extension.id);
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    const character = await createTestCharacter(user.id, { rulesetId: draft.id });
    const kept = await addCharacterLevel(character.id, copyLevel.id);

    for (const klassLevelId of [added.id, own.id]) {
      const level = await addCharacterLevel(character.id, klassLevelId);
      expect(RulesetExtensionsService.unsubscribeExtension(session, draft.id, extension.id)).rejects.toThrow(
        ConflictError,
      );
      await CharacterAdvancements.delete(db, { id: level.id });
    }
    await RulesetExtensionsService.unsubscribeExtension(session, draft.id, extension.id);
    expect(await CharacterAdvancements.findOne(db, { id: kept.id })).toMatchObject({ trackId: sourceLevel.id });
  });

  test("refuses an extension the fork doesn't use, another user, and an archived fork", async () => {
    const { session, extension, draft } = await setupFork();
    const { session: other } = await createTestUser();
    expect(RulesetExtensionsService.unsubscribeExtension(session, draft.id, extension.id)).rejects.toThrow(
      NotFoundError,
    );
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    expect(RulesetExtensionsService.unsubscribeExtension(other, draft.id, extension.id)).rejects.toThrow(
      ForbiddenError,
    );

    await RulesetsService.publishRuleset(session, draft.id);
    await RulesetsService.archiveRuleset(session, draft.id);
    expect(RulesetExtensionsService.unsubscribeExtension(session, draft.id, extension.id)).rejects.toThrow(
      UnprocessableEntityError,
    );
  });
});

describe("an extension's content in a fork", () => {
  test("reads a level its character took in a class a book copied, and the fork copied again, at the last copy's level", async () => {
    // A user's book copies the core Cleric; a fork's character took a cleric level, stored with the core class level's
    // id, before the fork took the book, then the fork copied the book's Cleric: each copy stands for the one before
    const { rulesetId } = await getSeedCtx();
    const { session: author } = await createTestUser();
    const { user, session } = await createTestUser();
    const [book, draft] = [await forkBase(author), await forkBase(session)];
    const coreCleric = (await Entities.findOne<Klass>(db, { entityType: "classes", name: "Cleric", rulesetId }))!;
    const character = await createCharacterOn(user.id, draft.id);
    await addOneLevel(session, character.id, coreCleric.id, 1, 8, null, {}, {}, {}, true);
    const levelRead = async () => {
      await CharactersService.getCharacter(session, character.id);
      const classes = (await buildAs(DetailedCharacter, character)).components.classes.getCharacterClasses();
      return classes["cleric"].levels.map((level) => level.klassLevel.id);
    };
    const firstLevelOf = async (klassRulesetId: string) =>
      (await findKlassLevel(
        (await Entities.findOne<Klass>(db, { entityType: "classes", name: "Cleric", rulesetId: klassRulesetId }))!.id,
        1,
      ))!.id;
    expect(await levelRead()).toEqual([await firstLevelOf(rulesetId)]);

    await EntitiesService.updateEntity(author, book.id, "classes", coreCleric.id, {
      name: "Cleric",
      description: "The book's",
    });
    await RulesetsService.publishRuleset(author, book.id, { kind: "extension" });
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [book.id]);
    expect(await levelRead()).toEqual([await firstLevelOf(book.id)]);

    const bookCleric = (await Entities.findOne<Klass>(db, {
      entityType: "classes",
      name: "Cleric",
      rulesetId: book.id,
    }))!;
    await EntitiesService.updateEntity(session, draft.id, "classes", bookCleric.id, {
      name: "Cleric",
      description: "The fork's",
    });
    expect(await levelRead()).toEqual([await firstLevelOf(draft.id)]);
  });

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
    const aptitude = (await Entities.findOne<Aptitude>(db, {
      entityType: "aptitudes",
      name: list,
      rulesetId: owner.id,
    }))!;
    const spellsOnList = async () =>
      (
        await EntitiesService.getEntities<Described<"spells">>(
          draft.id,
          "spells",
          { aptitudeId: aptitude.id },
          { limit: 1000, page: 1 },
        )
      ).items.map((spell) => spell.name);
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [owner.id]);
    expect(await spellsOnList()).not.toContain(spell);
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [adventurer.id]);
    expect(await spellsOnList()).toContain(spell);
  });

  test("lists and offers a spell whose link to a list is on another book's copy of the spell", async () => {
    // Bull's Strength composes as Complete Warrior's copy, while Complete Divine's puts it on the favored soul's list
    const { draft, list, offer } = await favoredSoulOnMixedFork();
    const search = "Bull's Strength";
    const listed = await EntitiesService.getEntities<Described<"spells">>(
      draft.id,
      "spells",
      { aptitudeId: list.id, search },
      firstPage,
    );
    expect(listed.items.map((spell) => spell.name)).toContain(search);
    expect((await offer({ search })).items.map((spell) => spell.name)).toContain(search);
  });

  test("lists and offers a feat whose link to a list is on another book's copy of the feat", async () => {
    // With Complete Adventurer before Complete Warrior, Combat Casting composes as Complete Adventurer's copy, while
    // Complete Warrior's puts it on the hexblade's bonus feats
    const { session, draft, character } = await forkTaking(DND35_COMPLETE_ADVENTURER_NAME, DND35_COMPLETE_WARRIOR_NAME);
    const warrior = await findSeededRuleset(DND35_COMPLETE_WARRIOR_NAME);
    const hexblade = (await Entities.findOne<Klass>(db, {
      entityType: "classes",
      name: "Hexblade",
      rulesetId: warrior.id,
    }))!;
    const list = (await Entities.findOne<Aptitude>(db, {
      entityType: "aptitudes",
      name: "Hexblade Bonus Feat",
      rulesetId: warrior.id,
    }))!;
    const search = "Combat Casting";
    const where = { aptitudeId: list.id, search };
    expect(
      (await EntitiesService.getEntities<Described<"feats">>(draft.id, "feats", where, firstPage)).items.map(
        (feat) => feat.name,
      ),
    ).toContain(search);
    expect(
      (await EntitiesService.getEntityGroups(draft.id, "feats", where, firstPage)).items.map(
        (group) => group.displayName,
      ),
    ).toContain(search);
    const offered = await featsOffered(session, character.id, hexblade.id, list.id, search);
    expect(offered.items.map((feat) => feat.name)).toContain(search);
  });

  test("gives a spell picked on a list another book's copy composes its level there", async () => {
    // Complete Divine's rows link Bane and Bless Water to its own list; Bless Water composes as Complete Warrior's copy
    const { character, favoredSoul, list, offer } = await favoredSoulOnMixedFork();
    const warrior = await findSeededRuleset(DND35_COMPLETE_WARRIOR_NAME);
    expect(list.id).toBe(
      (await Entities.findOne<Aptitude>(db, {
        entityType: "aptitudes",
        name: "Favored Soul Spells",
        rulesetId: warrior.id,
      }))!.id,
    );

    // Bane as the level-up offers it, and Bless Water as the fork composes it, on the composed list
    const bane = (await offer({ search: "Bane", spellLevel: 1 })).items.find((spell) => spell.name === "Bane")!;
    const blessWater = (await Entities.findOne<Spell>(db, {
      entityType: "spells",
      name: "Bless Water",
      rulesetId: warrior.id,
    }))!;
    const [first] = (
      await Entities.findMany<KlassLevel>(db, { entityType: "class_levels", ownerIds: [favoredSoul.id] })
    ).filter((level) => level.position === 1);
    await addCharacterLevel(character.id, first.id, {
      spells: { [list.id]: [bane.id, blessWater.id] },
    });

    const detailed = await buildAs(DetailedCharacter, character);
    const [level] = detailed.components.classes.getClasses()["favoredsoul"].levels;
    expect(Object.fromEntries(level.spells.map((spell) => [spell.name, spell.spellLevel]))).toEqual({
      Bane: 1,
      "Bless Water": 1,
    });
  });

  test("is edited and deleted on the fork's copies, the extension's rows untouched", async () => {
    const { session, extension, draft } = await setupFork();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    const [monkeyGrip, buckler] = [await warriorFeat("Monkey Grip"), await warriorFeat("Improved Buckler Defense")];

    const copy = await EntitiesService.updateEntity(session, draft.id, "feats", monkeyGrip.id, {
      name: "Monkey Grip",
      description: "Mine",
    });
    expect(await EntitiesService.getEntity<Described<"feats">>(draft.id, "feats", copy.id)).toMatchObject({
      rulesetId: draft.id,
      description: "Mine",
    });

    await EntitiesService.deleteEntity(session, draft.id, "feats", buckler.id);
    expect(await featsNamed(draft.id, "Improved Buckler Defense")).toEqual([]);
    expect(await Entities.findOne<Feat>(db, { entityType: "feats", id: buckler.id })).toMatchObject({ id: buckler.id });
  });

  test("keeps its names: a new feat can't take one, even once the fork copied it", async () => {
    const { session, extension, draft } = await setupFork();
    const { aptMap } = await getSeedCtx();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);
    const create = (name: string) =>
      EntitiesService.createEntity(session, draft.id, "feats", { name, aptitudeIds: [aptMap["General"]] });

    await expectRefusedWith(create("Monkey Grip"), 409);
    await EntitiesService.updateEntity(session, draft.id, "feats", (await warriorFeat("Monkey Grip")).id, {
      name: "Monkey Grip",
      description: "Mine",
    });
    // The copy holds the name in the fork: the database refuses a second one.
    expect(create("Monkey Grip")).rejects.toThrow();
    expect(await create(`Unique Feat ${uniqueId()}`)).toMatchObject({ rulesetId: draft.id });
  });

  test("keeps domain links on spells the extension copied", async () => {
    const { session, extension, draft } = await setupFork();
    const { aptMap } = await getSeedCtx();
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [extension.id]);

    const deathDomain = await EntitiesService.getEntities<Described<"spells">>(
      draft.id,
      "spells",
      { aptitudeId: aptMap["Death Domain Spells"] },
      firstPage,
    );
    expect(deathDomain.items.map((p) => p.name)).toEqual(
      expect.arrayContaining(["Cause Fear", "Death Knell", "Animate Dead", "Wail of the Banshee"]),
    );

    const [animateDead] = (
      await EntitiesService.getEntities<Described<"spells">>(draft.id, "spells", { search: "Animate Dead" }, firstPage)
    ).items;
    expect(animateDead.links.map((link) => link.toName)).toContain("Death Domain Spells");
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
    await CharacterLinks.createMany(
      db,
      character.id,
      "score",
      Object.values(abilityMap).map((entityId) => ({ entityId, amount: 10 })),
    );
    const barbarianLevels = (
      await Entities.findMany<KlassLevel>(db, { entityType: "class_levels", ownerIds: [klassMap.pc["Barbarian"]] })
    )
      .filter((l) => l.position <= 7)
      .sort((a, b) => a.position - b.position);
    for (const level of barbarianLevels) {
      const picks =
        level.position === 7
          ? {
              feats: { [aptMap["Barbarian Class Feature"]]: [featMap["Damage Reduction (Barbarian)"]] },
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
  describe.each(["feats", "spells"] as const)("%s", (entityType) => {
    const entity = ENTITIES[entityType];

    test("shows one, merging both extensions' aptitudes, requirements and modifiers without repeats", async () => {
      const { draft, baseId, contributions } = await setupSiblings(entityType);
      const aptitudeIds = contributions.map((c) => c.aptitudeId);

      const detail = await entity.get(draft.id, baseId);
      expect(detail.links.map((l) => l.toId)).toEqual(expect.arrayContaining(aptitudeIds));
      expect(unique(detail.links.map((l) => l.toId))).toBe(true);
      expect(detail.requirements.map((r) => r.target)).toEqual(
        expect.arrayContaining(contributions.map((c) => c.requirement)),
      );
      expect(detail.modifiers.map((m) => m.target)).toEqual(
        expect.arrayContaining(contributions.map((c) => c.modifier)),
      );

      const listed = (await entity.list(draft.id, entity.name)).filter((row) => row.name === entity.name);
      expect(listed).toHaveLength(1);
      expect(listed[0].links.map((l) => l.toId)).toEqual(expect.arrayContaining(aptitudeIds));

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

      expect((await entity.links(copyId)).map((l) => l.toId)).toEqual(
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
    await Entities.delete<Feat>(db, { entityType: "feats", id: trial.forkedEntityId });
    await EntitySnapshots.delete(db, { sourceEntityId: trial.sourceEntityId, rulesetId: draft.id });
    // Undone past the services, so the fork's view, which the edit's answer read, drops the trial copy
    RulesetViews.invalidate(draft.id);
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

describe("an extension's entity of a name its subscriber's own has", () => {
  test("is its author's to add or rename to, and the subscriber's view shows the subscriber's own in its place", async () => {
    const author = await createTestUser();
    const { session, draft } = await setupFork();
    const book = await createExtension(author.user.id);
    const general = { aptitudeIds: [(await getSeedCtx()).aptMap["General"]] };
    const later = await EntitiesService.createEntity(author.session, book.id, "feats", {
      name: "Probe Book Feat",
      ...general,
    });
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [book.id]);
    const own = await EntitiesService.createEntity(session, draft.id, "feats", { name: "Homebrew Feat", ...general });
    const ownRenamed = await EntitiesService.createEntity(session, draft.id, "feats", {
      name: "Homebrew Renamed",
      ...general,
    });

    // The author adds a feat of the subscriber's feat's name, and renames another to the other's: neither is refused
    const added = await EntitiesService.createEntity(author.session, book.id, "feats", { name: own.name, ...general });
    await EntitiesService.updateEntity(author.session, book.id, "feats", later.id, { name: ownRenamed.name });

    expect(await featsNamed(draft.id, own.name)).toMatchObject([{ id: own.id }]);
    expect(await featsNamed(draft.id, ownRenamed.name)).toMatchObject([{ id: ownRenamed.id }]);
    const view = await RulesetViews.getData((await Rulesets.findOne(db, { id: draft.id }))!);
    const shown = Dnd35View.of(view)
      .feats.filter((feat) => [own.name, ownRenamed.name].includes(feat.name))
      .map((feat) => feat.id);
    expect(shown.toSorted()).toEqual([own.id, ownRenamed.id].toSorted());
    expect(await featsNamed(book.id, own.name)).toMatchObject([{ id: added.id }]);
    await expectRefusedWith(
      EntitiesService.createEntity(session, draft.id, "feats", { name: own.name, ...general }),
      409,
    );

    // The subscriber's own renamed, the book's shows under its name
    await EntitiesService.updateEntity(session, draft.id, "feats", own.id, { name: "Homebrew Feat (Mine)" });
    expect(await featsNamed(draft.id, own.name)).toMatchObject([{ id: added.id }]);
  });

  test("reads the subscriber's own where the book's class, a pick and the level-up name the book's, not its own rows; an unsubscribe keeps the pick on it", async () => {
    const { user, session, draft } = await setupFork();
    const book = await createExtension((await createTestUser()).user.id);
    const { aptMap, klassMap } = await getSeedCtx();
    const general = aptMap["General"];
    await RulesetExtensionsService.subscribeExtension(session, draft.id, [book.id]);
    const own = await EntitiesService.createEntity(session, draft.id, "feats", {
      name: "Homebrew Feat",
      aptitudeIds: [general],
    });
    await Modifiers.create(db, { ...STRENGTH_BONUS, sourceType: "feats", sourceId: own.id });
    // The book's, added since: on a list of the book's and on the general feats, a class of the book's granting it
    const [bookFeat] = await Entities.create<Feat>(db, "feats", { name: own.name, rulesetId: book.id });
    const [bookList] = await Entities.create<Aptitude>(db, "aptitudes", {
      name: `Probe Book Feats ${uniqueId()}`,
      rulesetId: book.id,
    });
    await addLists(db, "feats", bookFeat.id, [{ aptitudeId: bookList.id }, { aptitudeId: general }]);
    await Modifiers.create(db, {
      ...STRENGTH_BONUS,
      target: "abilities.wisdom.misc",
      sourceType: "feats",
      sourceId: bookFeat.id,
    });
    const { klassLevel } = await createTestKlassLevel(book.id);
    await addGrants(db, klassLevel.id, "feats", [{ toId: bookFeat.id, aptitudeId: bookList.id }]);
    // Both rulesets' rows were written past their services, the fork's modifier among them
    RulesetViews.invalidate(book.id);
    RulesetViews.invalidate(draft.id);
    // A pick of the book's, as one made while both showed is stored
    const character = await createCharacterOn(user.id, draft.id);
    const { klassLevel: ownLevel } = await createTestKlassLevel(draft.id);
    const level = await addCharacterLevel(character.id, ownLevel.id, {
      feats: { [general]: [bookFeat.id] },
    });

    const view = await RulesetViews.getData((await Rulesets.findOne(db, { id: draft.id }))!);
    const dnd35 = Dnd35View.of(view);
    expect(dnd35.grantedFeatsOf(klassLevel.id)).toMatchObject([{ toId: own.id }]);
    expect(dnd35.listFeatIds(bookList.id)).toEqual([]);
    expect(dnd35.listFeatIds(general).filter((id) => [own.id, bookFeat.id].includes(id))).toEqual([own.id]);
    const described = await EntitiesService.getEntity<Described<"feats">>(draft.id, "feats", bookFeat.id);
    expect(described.id).toBe(own.id);
    expect(described.modifiers.map((modifier) => modifier.target)).toEqual([STRENGTH_BONUS.target]);

    const applied = (await buildAs(DetailedCharacter, character)).modifierEvaluator.getModifiers().appliedModifiers;
    expect(applied.filter((modifier) => modifier.sourceType === "feats").map((modifier) => modifier.sourceId)).toEqual([
      own.id,
    ]);
    const leveling = await createCharacterOn(user.id, draft.id);
    const offered = await featsOffered(session, leveling.id, klassMap.pc["Fighter"], general, own.name);
    expect(offered.items.filter((feat) => feat.name === own.name).map((feat) => feat.id)).toEqual([own.id]);

    await RulesetExtensionsService.unsubscribeExtension(session, draft.id, book.id);
    expect(await picksOf("feats", level.id)).toEqual([{ entityId: own.id, aptitudeId: general }]);
  });
});
