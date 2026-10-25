import { afterEach, describe, expect, test } from "bun:test";

import type { Feat, Klass, KlassLevel, Race, Spell } from "@/engine/rulesets/dnd3.5/index.ts";
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
  EntityLinks,
  EntitySnapshots,
  Rulesets,
} from "@/server/repositories/index.ts";
import { RulesetChangesService } from "@/server/services/rulesets/changes/index.ts";
import { findLinks } from "@/tests/support/characters.ts";
import { createTestCharacter } from "@/tests/support/dnd3.5/characters.ts";
import { addCharacterLevel, createTestKlassLevel, findPicks } from "@/tests/support/dnd3.5/levels.ts";
import {
  addBaseBonuses,
  addClassSkills,
  addGrants,
  addLists,
  findGrants,
  findLists,
} from "@/tests/support/dnd3.5/links.ts";
import { copyEntity, createSeededTestRuleset, createTestRuleset } from "@/tests/support/rulesets.ts";
import { findPlainItem, getSeedCtx, uniqueId } from "@/tests/support/seed.ts";
import { createTestUser } from "@/tests/support/users.ts";
import { CLASS_HD, RACE_BASE_SPEED, RACE_SIZE } from "@/vocabulary/dnd3.5/fields/index.ts";

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

/** A fork's own feat and spell, each named uniquely. */
async function createOwnFeatAndSpell(rulesetId: string) {
  const [feat] = await Entities.create<Feat>(db, "feats", { name: `Own Feat ${uniqueId()}`, rulesetId });
  const [spell] = await Entities.create<Spell>(db, "spells", { name: `Own Spell ${uniqueId()}`, rulesetId });
  return { feat, spell };
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
    const { feat, spell } = await createOwnFeatAndSpell(fork.id);
    await addLists(db, "feats", feat.id, [{ aptitudeId: copy.id }]);
    await addLists(db, "spells", spell.id, [{ aptitudeId: copy.id, level: 1 }]);
    const { klassLevel } = await createTestKlassLevel(fork.id);
    await addGrants(db, klassLevel.id, "feats", [{ toId: feat.id, aptitudeId: copy.id }]);
    await addGrants(db, klassLevel.id, "spells", [{ toId: spell.id, aptitudeId: copy.id }]);
    const character = await createTestCharacter(user.id, { rulesetId: fork.id });
    const level = await addCharacterLevel(character.id, klassLevel.id, {
      feats: { [copy.id]: [feat.id] },
      spells: { [copy.id]: [spell.id] },
    });

    await RulesetChangesService.revertOverride(session, fork.id, "aptitudes", general);

    expect(await findLists(db, [feat.id])).toMatchObject([{ toId: general }]);
    expect(await findLists(db, [spell.id])).toMatchObject([{ toId: general, tier: 1 }]);
    expect(await findGrants(db, [klassLevel.id], "feats")).toMatchObject([{ toId: feat.id, viaId: general }]);
    expect(await findGrants(db, [klassLevel.id], "spells")).toMatchObject([{ toId: spell.id, viaId: general }]);
    expect(await findPicks("feats", [level.id])).toMatchObject([{ entityId: feat.id, viaId: general }]);
    expect(await findPicks("spells", [level.id])).toMatchObject([{ entityId: spell.id, viaId: general }]);
    expect(
      await withRulesetScope(db, fork.id, async ({ rulesetData }) =>
        Dnd35View.of(rulesetData)
          .listLinksOf(feat.id)
          .map((link) => link.toId),
      ),
    ).toEqual([general]);
  });

  test("points a class level's grants of a copied feat and a copied spell back at the source", async () => {
    const { session, fork, ctx } = await setup();
    const dodge = ctx.featMap.Dodge;
    const [spellId] = Object.values(ctx.spellMap);
    const feat = await copyEntity(db, "feats", dodge, fork);
    const spell = await copyEntity(db, "spells", spellId, fork);
    const { klassLevel } = await createTestKlassLevel(fork.id);
    await addGrants(db, klassLevel.id, "feats", [{ toId: feat.id, aptitudeId: ctx.aptMap.General }]);
    await addGrants(db, klassLevel.id, "spells", [{ toId: spell.id, aptitudeId: ctx.aptMap.General }]);

    await RulesetChangesService.revertOverride(session, fork.id, "feats", dodge);
    await RulesetChangesService.revertOverride(session, fork.id, "spells", spellId);

    expect(await findGrants(db, [klassLevel.id], "feats")).toMatchObject([{ toId: dodge }]);
    expect(await findGrants(db, [klassLevel.id], "spells")).toMatchObject([{ toId: spellId }]);
    expect(await Entities.findOne<Feat>(db, { entityType: "feats", id: feat.id })).toBeUndefined();
    expect(await Entities.findOne<Spell>(db, { entityType: "spells", id: spell.id })).toBeUndefined();
  });

  test("points a spell's save and a class level's saves at the source save", async () => {
    const { session, fork, ctx } = await setup();
    const reflex = ctx.saveMap.Reflex;
    const copy = await copyEntity(db, "saves", reflex, fork);
    const [spell] = await Entities.create<Spell>(db, "spells", {
      name: `Own Spell ${uniqueId()}`,
      rulesetId: fork.id,
      links: { resistedBy: copy.id },
    });
    const { klassLevel } = await createTestKlassLevel(fork.id);
    await addBaseBonuses(db, klassLevel.id, [{ saveId: copy.id, base: 2 }]);

    await RulesetChangesService.revertOverride(session, fork.id, "saves", reflex);

    expect(await Entities.findOne<Spell>(db, { entityType: "spells", id: spell.id })).toMatchObject({
      links: { resistedBy: reflex },
    });
    expect(await EntityLinks.findMany(db, { fromIds: [klassLevel.id], role: "baseBonus" })).toMatchObject([
      { toId: reflex, amount: 2 },
    ]);
  });

  test("points a class's skills and a race's or a class's parent at the source", async () => {
    const { session, fork, ctx } = await setup();
    const climb = ctx.skillMap.Climb;
    const human = ctx.raceMap.pc.Human;
    const fighter = ctx.klassMap.pc.Fighter;
    const skill = await copyEntity(db, "skills", climb, fork);
    const race = await copyEntity(db, "races", human, fork);
    const parentClass = await copyEntity(db, "classes", fighter, fork);
    const { klass } = await createTestKlassLevel(fork.id);
    await addClassSkills(db, klass.id, [skill.id]);
    await Entities.update<Klass>(db, "classes", { links: { subclassOf: parentClass.id } }, { id: klass.id });
    const [subrace] = await Entities.create<Race>(db, "races", {
      name: `Own Subrace ${uniqueId()}`,
      rulesetId: fork.id,
      fields: { [RACE_SIZE]: "Medium", [RACE_BASE_SPEED]: 30 },
      links: { subraceOf: race.id },
    });

    await RulesetChangesService.revertOverride(session, fork.id, "skills", climb);
    await RulesetChangesService.revertOverride(session, fork.id, "races", human);
    await RulesetChangesService.revertOverride(session, fork.id, "classes", fighter);

    expect(await EntityLinks.findMany(db, { fromIds: [klass.id], role: "classSkill" })).toMatchObject([
      { toId: climb },
    ]);
    expect(await Entities.findOne<Race>(db, { entityType: "races", id: subrace.id })).toMatchObject({
      links: { subraceOf: human },
    });
    expect(await Entities.findOne<Klass>(db, { entityType: "classes", id: klass.id })).toMatchObject({
      links: { subclassOf: fighter },
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
      feats: { [ctx.aptMap.General]: [feat.id] },
      skills: { [skill.id]: 2 },
    });
    await CharacterInventory.create(db, { characterId: character.id, itemId: itemCopy.id, quantity: 1 });
    await CharacterLinks.createMany(db, character.id, "speaks", [{ entityId: languageCopy.id }]);

    await RulesetChangesService.revertOverride(session, fork.id, "feats", dodge);
    await RulesetChangesService.revertOverride(session, fork.id, "skills", climb);
    await RulesetChangesService.revertOverride(session, fork.id, "races", human);
    await RulesetChangesService.revertOverride(session, fork.id, "items", item.id);
    await RulesetChangesService.revertOverride(session, fork.id, "languages", language);

    expect(await findPicks("feats", [level.id])).toMatchObject([{ entityId: dodge }]);
    expect(await findPicks("skills", [level.id])).toMatchObject([{ entityId: climb, amount: 2 }]);
    expect(await Characters.findOne(db, { id: character.id })).toMatchObject({ links: { race: human } });
    expect(await CharacterInventory.findMany(db, { characterId: character.id })).toMatchObject([{ itemId: item.id }]);
    expect(await findLinks("speaks", character.id)).toMatchObject([{ entityId: language }]);
  });

  test("moves a character's levels in a copied class to the source's levels of the same number", async () => {
    const { user, session, fork, ctx } = await setup();
    const fighter = ctx.klassMap.pc.Fighter;
    const copy = await copyEntity(db, "classes", fighter, fork);
    const [copyLevel] = await Entities.findMany<KlassLevel>(db, { entityType: "class_levels", ownerIds: [copy.id] });
    const [sourceLevel] = (
      await Entities.findMany<KlassLevel>(db, { entityType: "class_levels", ownerIds: [fighter] })
    ).filter((level) => level.position === copyLevel.position);
    const character = await createTestCharacter(user.id, { rulesetId: fork.id });
    const level = await addCharacterLevel(character.id, copyLevel.id);

    await RulesetChangesService.revertOverride(session, fork.id, "classes", fighter);

    expect(await CharacterAdvancements.findOne(db, { id: level.id })).toMatchObject({ trackId: sourceLevel.id });
    expect(await Entities.findOne<Klass>(db, { entityType: "classes", id: copy.id })).toBeUndefined();
  });

  test("is refused while a character took a level the copied class added", async () => {
    const { user, session } = await createTestUser();
    const parent = await createTestRuleset(null, { private: false, status: "Published" });
    const fork = await createTestRuleset(user.id, { rulesetId: parent.id, ancestorRulesetIds: [parent.id] });
    // A class of the parent's, with one level, which the fork copied and gave a second
    const [source] = await Entities.create<Klass>(db, "classes", {
      name: `Parent Class ${uniqueId()}`,
      rulesetId: parent.id,
      fields: { [CLASS_HD]: 8 },
    });
    await Entities.create<KlassLevel>(db, "class_levels", { ownerId: source.id, position: 1 });
    const copy = await copyEntity(db, "classes", source.id, fork);
    const [added] = await Entities.create<KlassLevel>(db, "class_levels", { ownerId: copy.id, position: 2 });
    const character = await createTestCharacter(user.id, { rulesetId: fork.id });
    await addCharacterLevel(character.id, added.id);

    expect(RulesetChangesService.revertOverride(session, fork.id, "classes", source.id)).rejects.toThrow(ConflictError);
    expect(await Entities.findOne<Klass>(db, { entityType: "classes", id: copy.id })).toMatchObject({ id: copy.id });
  });

  test("keeps one link where the fork links to the list and to its copy", async () => {
    const { session, fork, ctx } = await setup();
    const general = ctx.aptMap.General;
    const copy = await copyEntity(db, "aptitudes", general, fork);
    const { feat } = await createOwnFeatAndSpell(fork.id);
    await addLists(db, "feats", feat.id, [{ aptitudeId: general }, { aptitudeId: copy.id }]);

    await RulesetChangesService.revertOverride(session, fork.id, "aptitudes", general);

    expect(await findLists(db, [feat.id])).toMatchObject([{ toId: general }]);
  });

  test("points a host's rows, its characters' picks and its copies at the source when an extension reverts", async () => {
    const { user, session, ctx } = await setup();
    const { extension, host } = await createExtensionAndHost(user.id, ctx.rulesetId);
    const { General: general } = ctx.aptMap;
    const { Dodge: dodge } = ctx.featMap;
    const listCopy = await copyEntity(db, "aptitudes", general, extension);
    const dodgeCopy = await copyEntity(db, "feats", dodge, extension);
    // What the host writes by the ids its view shows: the extension's copies
    const { feat } = await createOwnFeatAndSpell(host.id);
    await addLists(db, "feats", feat.id, [{ aptitudeId: listCopy.id }]);
    const hostCopy = await copyEntity(db, "feats", dodgeCopy.id, host);
    const character = await createTestCharacter(user.id, { rulesetId: host.id });
    const { klassLevel } = await createTestKlassLevel(host.id);
    const level = await addCharacterLevel(character.id, klassLevel.id, {
      feats: { [listCopy.id]: [dodgeCopy.id] },
    });
    const readHost = () =>
      withRulesetScope(db, host.id, async ({ rulesetData }) => ({
        links: Dnd35View.of(rulesetData)
          .listLinksOf(feat.id)
          .map((link) => link.toId),
        dodge: rulesetData.cow.resolve(dodge),
      }));
    expect(await readHost()).toEqual({ links: [listCopy.id], dodge: hostCopy.id });

    await RulesetChangesService.revertOverride(session, extension.id, "aptitudes", general);
    await RulesetChangesService.revertOverride(session, extension.id, "feats", dodge);

    expect(await findLists(db, [feat.id])).toMatchObject([{ toId: general }]);
    expect(await findPicks("feats", [level.id])).toMatchObject([{ entityId: dodge, viaId: general }]);
    expect(await EntitySnapshots.findMany(db, { rulesetId: host.id })).toMatchObject([
      { sourceEntityId: dodge, forkedEntityId: hostCopy.id },
    ]);
    expect(await readHost()).toEqual({ links: [general], dodge: hostCopy.id });
  });
});
