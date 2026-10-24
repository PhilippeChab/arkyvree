import { afterEach, describe, expect, test } from "bun:test";

import type {
  CharacterLanguage,
  Feat,
  Klass,
  KlassLevel,
  KlassLevelFeat,
  KlassLevelPower,
  KlassLevelSave,
  KlassSkill,
  LevelFeat,
  LevelPower,
  LevelSkill,
  Power,
  Race,
} from "@/engine/rulesets/dnd3.5/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import {
  CharacterAdvancements,
  CharacterInventory,
  CharacterLinks,
  Characters,
  Entities,
  EntitySnapshots,
  Joins,
  Picks,
  Rulesets,
} from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { addCharacterLevel, createTestKlassLevel } from "@/tests/support/dnd3.5/levels.ts";
import { copyEntity, createSeededTestRuleset, createTestRuleset } from "@/tests/support/rulesets.ts";
import { findPlainItem, getSeedCtx, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";

/** A user's published extension of the seeded rules, and a fork of theirs subscribing to it. */
async function createExtensionAndHost(userId: string, coreId: string) {
  const extension = await createTestRuleset(userId, {
    rulesetId: coreId,
    ancestorRulesetIds: [coreId],
    kind: "extension",
    private: false,
    status: "Published",
  });
  const fork = await createSeededTestRuleset(userId);
  const [host] = await Rulesets.update(db, { extensionRulesetIds: [extension.id] }, { id: fork.id });
  return { extension, host };
}

/** A fork's own feat and power, each named uniquely. */
async function createOwnFeatAndPower(rulesetId: string) {
  const [feat] = await Entities.create<Feat>(db, "feats", { name: `Own Feat ${uniqueId()}`, rulesetId });
  const [power] = await Entities.create<Power>(db, "powers", { name: `Own Power ${uniqueId()}`, rulesetId });
  return { feat, power };
}

/** A new user's fork of the seeded rules, and the seeded ids. */
async function setup() {
  const { user, session } = await createTestUser();
  const fork = await createSeededTestRuleset(user.id);
  return { user, session, fork, ctx: await getSeedCtx() };
}

afterEach(() => RulesetViews.invalidateAll());

describe("reverting a fork's copy", () => {
  test("points what names its copy of a list back at the list: links, class grants and picks", async () => {
    const { user, session, fork, ctx } = await setup();
    const general = ctx.aptMap.General;
    const copy = await copyEntity(db, "aptitudes", general, fork);
    const { feat, power } = await createOwnFeatAndPower(fork.id);
    await Joins.create(db, "feats_aptitudes", { featId: feat.id, aptitudeId: copy.id });
    await Joins.create(db, "powers_aptitudes", { powerId: power.id, aptitudeId: copy.id, level: 1 });
    const { klassLevel } = await createTestKlassLevel(fork.id);
    await Joins.create<KlassLevelFeat>(db, "klass_level_feats", {
      klassLevelId: klassLevel.id,
      featId: feat.id,
      aptitudeId: copy.id,
    });
    await Joins.createMany<KlassLevelPower>(db, "klass_level_powers", [
      { klassLevelId: klassLevel.id, powerId: power.id, aptitudeId: copy.id },
    ]);
    const character = await createTestCharacter(user.id, { rulesetId: fork.id });
    const level = await addCharacterLevel(character.id, klassLevel.id, {
      feats: [{ featId: feat.id, aptitudeId: copy.id }],
      powers: [{ powerId: power.id, aptitudeId: copy.id }],
    });

    await RulesetChangesService.revertOverride(session, fork.id, "aptitudes", general);

    expect(
      await Joins.findMany<{ aptitudeId: string; featId: string }>(db, { join: "feats_aptitudes", fromIds: [feat.id] }),
    ).toMatchObject([{ aptitudeId: general }]);
    expect(
      await Joins.findMany<{ aptitudeId: string; level: number | null; powerId: string }>(db, {
        join: "powers_aptitudes",
        fromIds: [power.id],
      }),
    ).toMatchObject([{ aptitudeId: general, level: 1 }]);
    expect(
      await Joins.findMany<KlassLevelFeat>(db, { join: "klass_level_feats", fromIds: [klassLevel.id] }),
    ).toMatchObject([{ featId: feat.id, aptitudeId: general }]);
    expect(
      await Joins.findMany<KlassLevelPower>(db, { join: "klass_level_powers", fromIds: [klassLevel.id] }),
    ).toMatchObject([{ powerId: power.id, aptitudeId: general }]);
    const levelIds = { characterLevelIds: [level.id] };
    expect(await Picks.findMany<LevelFeat>(db, { pick: "feats", ...levelIds })).toMatchObject([
      { featId: feat.id, aptitudeId: general },
    ]);
    expect(await Picks.findMany<LevelPower>(db, { pick: "powers", ...levelIds })).toMatchObject([
      { powerId: power.id, aptitudeId: general },
    ]);
    expect(
      await withRulesetScope(db, fork.id, async ({ rulesetData }) =>
        Dnd35View.of(rulesetData)
          .featsById.get(feat.id)
          ?.featsAptitudesInRules.map((link) => link.aptitudeId),
      ),
    ).toEqual([general]);
  });

  test("points a class level's grants of a copied feat and a copied spell back at the source", async () => {
    const { session, fork, ctx } = await setup();
    const dodge = ctx.featMap.Dodge;
    const [spellId] = Object.values(ctx.powerMap);
    const feat = await copyEntity(db, "feats", dodge, fork);
    const power = await copyEntity(db, "powers", spellId, fork);
    const { klassLevel } = await createTestKlassLevel(fork.id);
    await Joins.create<KlassLevelFeat>(db, "klass_level_feats", {
      klassLevelId: klassLevel.id,
      featId: feat.id,
      aptitudeId: ctx.aptMap.General,
    });
    await Joins.createMany<KlassLevelPower>(db, "klass_level_powers", [
      { klassLevelId: klassLevel.id, powerId: power.id, aptitudeId: ctx.aptMap.General },
    ]);

    await RulesetChangesService.revertOverride(session, fork.id, "feats", dodge);
    await RulesetChangesService.revertOverride(session, fork.id, "powers", spellId);

    expect(
      await Joins.findMany<KlassLevelFeat>(db, { join: "klass_level_feats", fromIds: [klassLevel.id] }),
    ).toMatchObject([{ featId: dodge }]);
    expect(
      await Joins.findMany<KlassLevelPower>(db, { join: "klass_level_powers", fromIds: [klassLevel.id] }),
    ).toMatchObject([{ powerId: spellId }]);
    expect(await Entities.findOne<Feat>(db, { entityType: "feats", id: feat.id })).toBeUndefined();
    expect(await Entities.findOne<Power>(db, { entityType: "powers", id: power.id })).toBeUndefined();
  });

  test("points a spell's save and a class level's saves at the source save", async () => {
    const { session, fork, ctx } = await setup();
    const reflex = ctx.saveMap.Reflex;
    const copy = await copyEntity(db, "saves", reflex, fork);
    const [power] = await Entities.create<Power>(db, "powers", {
      name: `Own Power ${uniqueId()}`,
      rulesetId: fork.id,
      saveId: copy.id,
    });
    const { klassLevel } = await createTestKlassLevel(fork.id);
    await Joins.createMany<KlassLevelSave>(db, "klass_level_saves", [
      { klassLevelId: klassLevel.id, saveId: copy.id, base: 2 },
    ]);

    await RulesetChangesService.revertOverride(session, fork.id, "saves", reflex);

    expect(await Entities.findOne<Power>(db, { entityType: "powers", id: power.id })).toMatchObject({ saveId: reflex });
    expect(
      await Joins.findMany<KlassLevelSave>(db, { join: "klass_level_saves", fromIds: [klassLevel.id] }),
    ).toMatchObject([{ saveId: reflex, base: 2 }]);
  });

  test("points a class's skills and a race's or a class's parent at the source", async () => {
    const { session, fork, ctx } = await setup();
    const climb = ctx.skillMap.Climb;
    const human = ctx.raceMap.pc.Human;
    const fighter = ctx.klassMap.pc.Fighter;
    const skill = await copyEntity(db, "skills", climb, fork);
    const race = await copyEntity(db, "races", human, fork);
    const parentClass = await copyEntity(db, "klasses", fighter, fork);
    const { klass } = await createTestKlassLevel(fork.id);
    await Joins.create<KlassSkill>(db, "klass_skills", { klassId: klass.id, skillId: skill.id });
    await Entities.update<Klass>(db, "klasses", { parentId: parentClass.id }, { id: klass.id });
    const [subrace] = await Entities.create<Race>(db, "races", {
      name: `Own Subrace ${uniqueId()}`,
      rulesetId: fork.id,
      size: "Medium",
      baseSpeed: 30,
      parentId: race.id,
    });

    await RulesetChangesService.revertOverride(session, fork.id, "skills", climb);
    await RulesetChangesService.revertOverride(session, fork.id, "races", human);
    await RulesetChangesService.revertOverride(session, fork.id, "klasses", fighter);

    expect(await Joins.findMany<KlassSkill>(db, { join: "klass_skills", fromIds: [klass.id] })).toMatchObject([
      { skillId: climb },
    ]);
    expect(await Entities.findOne<Race>(db, { entityType: "races", id: subrace.id })).toMatchObject({
      parentId: human,
    });
    expect(await Entities.findOne<Klass>(db, { entityType: "klasses", id: klass.id })).toMatchObject({
      parentId: fighter,
    });
  });

  test("points the picks of the fork's characters at the source instead of refusing", async () => {
    const { user, session, fork, ctx } = await setup();
    const { dodge, climb, human } = {
      dodge: ctx.featMap.Dodge,
      climb: ctx.skillMap.Climb,
      human: ctx.raceMap.pc.Human,
    };
    const item = await findPlainItem(ctx.rulesetId);
    const [language] = Object.values(ctx.langMap);
    const feat = await copyEntity(db, "feats", dodge, fork);
    const skill = await copyEntity(db, "skills", climb, fork);
    const race = await copyEntity(db, "races", human, fork);
    const itemCopy = await copyEntity(db, "items", item.id, fork);
    const languageCopy = await copyEntity(db, "languages", language, fork);
    const character = await createTestCharacter(user.id, { rulesetId: fork.id, raceId: race.id });
    const { klassLevel } = await createTestKlassLevel(fork.id);
    const level = await addCharacterLevel(character.id, klassLevel.id, {
      feats: [{ featId: feat.id, aptitudeId: ctx.aptMap.General }],
      skills: [{ skillId: skill.id, rank: 2 }],
    });
    await CharacterInventory.create(db, { characterId: character.id, itemId: itemCopy.id, quantity: 1 });
    await CharacterLinks.create(db, "languages", { characterId: character.id, languageId: languageCopy.id });

    await RulesetChangesService.revertOverride(session, fork.id, "feats", dodge);
    await RulesetChangesService.revertOverride(session, fork.id, "skills", climb);
    await RulesetChangesService.revertOverride(session, fork.id, "races", human);
    await RulesetChangesService.revertOverride(session, fork.id, "items", item.id);
    await RulesetChangesService.revertOverride(session, fork.id, "languages", language);

    const levelIds = { characterLevelIds: [level.id] };
    expect(await Picks.findMany<LevelFeat>(db, { pick: "feats", ...levelIds })).toMatchObject([{ featId: dodge }]);
    expect(await Picks.findMany<LevelSkill>(db, { pick: "skills", ...levelIds })).toMatchObject([
      { skillId: climb, rank: 2 },
    ]);
    expect(await Characters.findOne(db, { id: character.id })).toMatchObject({ raceId: human });
    expect(await CharacterInventory.findMany(db, { characterId: character.id })).toMatchObject([{ itemId: item.id }]);
    expect(
      await CharacterLinks.findMany<CharacterLanguage>(db, { link: "languages", characterId: character.id }),
    ).toMatchObject([{ languageId: language }]);
  });

  test("moves a character's levels in a copied class to the source's levels of the same number", async () => {
    const { user, session, fork, ctx } = await setup();
    const fighter = ctx.klassMap.pc.Fighter;
    const copy = await copyEntity(db, "klasses", fighter, fork);
    const [copyLevel] = await Entities.findMany<KlassLevel>(db, { entityType: "klass_levels", ownerIds: [copy.id] });
    const [sourceLevel] = (
      await Entities.findMany<KlassLevel>(db, { entityType: "klass_levels", ownerIds: [fighter] })
    ).filter((level) => level.level === copyLevel.level);
    const character = await createTestCharacter(user.id, { rulesetId: fork.id });
    const level = await addCharacterLevel(character.id, copyLevel.id);

    await RulesetChangesService.revertOverride(session, fork.id, "klasses", fighter);

    expect(await CharacterAdvancements.findOne(db, { id: level.id })).toMatchObject({ klassLevelId: sourceLevel.id });
    expect(await Entities.findOne<Klass>(db, { entityType: "klasses", id: copy.id })).toBeUndefined();
  });

  test("is refused while a character took a level the copied class added", async () => {
    const { user, session } = await createTestUser();
    const parent = await createTestRuleset(null, { private: false, status: "Published" });
    const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });
    // A class of the parent's, with one level, which the fork copied and gave a second
    const [source] = await Entities.create<Klass>(db, "klasses", {
      name: `Parent Class ${uniqueId()}`,
      rulesetId: parent.id,
      hd: 8,
    });
    await Entities.create<KlassLevel>(db, "klass_levels", { klassId: source.id, level: 1 });
    const copy = await copyEntity(db, "klasses", source.id, fork);
    const [added] = await Entities.create<KlassLevel>(db, "klass_levels", { klassId: copy.id, level: 2 });
    const character = await createTestCharacter(user.id, { rulesetId: fork.id });
    await addCharacterLevel(character.id, added.id);

    expect(RulesetChangesService.revertOverride(session, fork.id, "klasses", source.id)).rejects.toThrow(ConflictError);
    expect(await Entities.findOne<Klass>(db, { entityType: "klasses", id: copy.id })).toMatchObject({ id: copy.id });
  });

  test("keeps one link where the fork links to the list and to its copy", async () => {
    const { session, fork, ctx } = await setup();
    const general = ctx.aptMap.General;
    const copy = await copyEntity(db, "aptitudes", general, fork);
    const { feat } = await createOwnFeatAndPower(fork.id);
    await Joins.create(db, "feats_aptitudes", { featId: feat.id, aptitudeId: general });
    await Joins.create(db, "feats_aptitudes", { featId: feat.id, aptitudeId: copy.id });

    await RulesetChangesService.revertOverride(session, fork.id, "aptitudes", general);

    expect(
      await Joins.findMany<{ aptitudeId: string; featId: string }>(db, { join: "feats_aptitudes", fromIds: [feat.id] }),
    ).toMatchObject([{ aptitudeId: general }]);
  });

  test("points a host's rows, its characters' picks and its copies at the source when an extension reverts", async () => {
    const { user, session, ctx } = await setup();
    const { extension, host } = await createExtensionAndHost(user.id, ctx.rulesetId);
    const { General: general } = ctx.aptMap;
    const { Dodge: dodge } = ctx.featMap;
    const listCopy = await copyEntity(db, "aptitudes", general, extension);
    const dodgeCopy = await copyEntity(db, "feats", dodge, extension);
    // What the host writes by the ids its view shows: the extension's copies
    const { feat } = await createOwnFeatAndPower(host.id);
    await Joins.create(db, "feats_aptitudes", { featId: feat.id, aptitudeId: listCopy.id });
    const hostCopy = await copyEntity(db, "feats", dodgeCopy.id, host);
    const character = await createTestCharacter(user.id, { rulesetId: host.id });
    const { klassLevel } = await createTestKlassLevel(host.id);
    const level = await addCharacterLevel(character.id, klassLevel.id, {
      feats: [{ featId: dodgeCopy.id, aptitudeId: listCopy.id }],
    });
    const readHost = () =>
      withRulesetScope(db, host.id, async ({ rulesetData }) => ({
        links: Dnd35View.of(rulesetData)
          .featsById.get(feat.id)
          ?.featsAptitudesInRules.map((link) => link.aptitudeId),
        dodge: rulesetData.cow.resolve(dodge),
      }));
    expect(await readHost()).toEqual({ links: [listCopy.id], dodge: hostCopy.id });

    await RulesetChangesService.revertOverride(session, extension.id, "aptitudes", general);
    await RulesetChangesService.revertOverride(session, extension.id, "feats", dodge);

    expect(
      await Joins.findMany<{ aptitudeId: string; featId: string }>(db, { join: "feats_aptitudes", fromIds: [feat.id] }),
    ).toMatchObject([{ aptitudeId: general }]);
    expect(await Picks.findMany<LevelFeat>(db, { pick: "feats", characterLevelIds: [level.id] })).toMatchObject([
      { featId: dodge, aptitudeId: general },
    ]);
    expect(await EntitySnapshots.findMany(db, { rulesetId: host.id })).toMatchObject([
      { sourceEntityId: dodge, forkedEntityId: hostCopy.id },
    ]);
    expect(await readHost()).toEqual({ links: [general], dodge: hostCopy.id });
  });
});
