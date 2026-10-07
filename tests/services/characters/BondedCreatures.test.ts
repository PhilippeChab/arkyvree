import { describe, expect, test } from "bun:test";

import { addClassLevels, addFeats } from "@/database/seeds/seedCharacter.ts";
import { SEED_USER_ID } from "@/database/seeds/users.ts";
import DetailedCharacterAnimalCompanion from "@/engine/rulesets/dnd3.5/bonded/DetailedCharacterAnimalCompanion.ts";
import DetailedCharacterFamiliar from "@/engine/rulesets/dnd3.5/bonded/DetailedCharacterFamiliar.ts";
import DetailedCharacterMount from "@/engine/rulesets/dnd3.5/bonded/DetailedCharacterMount.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/character/DetailedCharacter.ts";
import { CARRYING_CAPACITY } from "@/engine/rulesets/dnd3.5/constants.ts";
import Dnd35TargetPaths from "@/engine/rulesets/dnd3.5/Dnd35TargetPaths.ts";
import { getBondedRaceStats } from "@/engine/rulesets/dnd3.5/index.ts";
import { db } from "@/server/database/index.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { CharacterLevels, Characters, Modifiers, Players } from "@/server/repositories/index.ts";
import { CampaignCharactersService } from "@/server/services/campaigns/characters/index.ts";
import { CharacterContributorsService } from "@/server/services/characters/contributors/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { CharacterInventoryService } from "@/server/services/characters/inventory/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";
import { CharacterModifiersService } from "@/server/services/characters/modifiers/index.ts";
import { CharacterSharingService } from "@/server/services/characters/sharing/index.ts";
import { stripSeparators } from "@/shared/text.ts";
import { createTestCampaign } from "@/tests/support/campaigns.ts";
import { buildAs } from "@/tests/support/characters.ts";
import { addCharacterContributor } from "@/tests/support/contributors.ts";
import { queuedPdfJobs } from "@/tests/support/jobs.ts";
import {
  createDruidWithCompanion,
  createPaladinWithMount,
  createSeedCharacter,
  createWizardWithFamiliar,
  levelUp,
  picking,
  picks,
  SORCERER_1,
  WIZARD_1,
} from "@/tests/support/levelFixtures.ts";
import { addOneLevel, findKlassLevel } from "@/tests/support/levels.ts";
import { invalidateSeededRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";
import { createTestUser, makeSession } from "@/tests/support/users.ts";

const owner = makeSession();
function familiarOf(masterId: string) {
  return Characters.findOne(db, { parentCharacterId: masterId, kind: "familiar" });
}

/** A bonded creature's numbers, as its sheet shows them. */
function statBlock(detailed: DetailedCharacterMount | DetailedCharacterAnimalCompanion) {
  const { hp, bab, ac, weaponsets } = detailed.components.combat.getCombat();
  const saves = detailed.components.savingThrows.getSavingThrows();
  const abilities = detailed.components.abilities.getAbilities();
  const bite = weaponsets["0"]?.mainhand;
  return {
    hp: hp.base,
    bab,
    natural: ac.natural,
    size: ac.size,
    ac: ac.total,
    baseSaves: { fortitude: saves.fortitude.base, reflex: saves.reflex.base, will: saves.will.base },
    saves: { fortitude: saves.fortitude.total, reflex: saves.reflex.total, will: saves.will.total },
    abilities: {
      strength: abilities.strength.total,
      intelligence: abilities.intelligence.total,
      misc: [abilities.strength.misc, abilities.dexterity.misc],
    },
    attack: { name: bite?.name, size: bite?.tohit?.size, toHit: bite?.tohit?.total?.[0], damage: bite?.damage?.total },
  };
}

describe("Bonded creatures", () => {
  test.each([
    ["a wizard's familiar", () => createWizardWithFamiliar(), "familiar", "Cat", 1],
    ["a druid's animal companion", () => createDruidWithCompanion(3), "animalcompanion", "Wolf", 3],
    ["a paladin's special mount", () => createPaladinWithMount(5), "mount", "Heavy Warhorse", 5],
  ] as const)(
    "%s is made from their pick, a level for each of theirs, and shown with them",
    async (_, create, kind, race, levels) => {
      const { ctx, masterId, bonded } = await create();
      expect(bonded).toMatchObject({
        kind,
        parentCharacterId: masterId,
        userId: SEED_USER_ID,
        raceId: ctx.raceMap[kind][race],
      });
      expect(await CharacterLevels.findMany(db, { characterId: bonded.id })).toHaveLength(levels);
      expect((await CharactersService.getCharacter(owner, masterId)).bondedByKind[kind]?.record).toMatchObject({
        id: bonded.id,
        kind,
      });
    },
  );

  // A familiar's feats are its stat block's; a companion's and a mount's come with their hit dice, given, not picked
  test.each([
    ["a wizard's familiar", () => createWizardWithFamiliar(), DetailedCharacterFamiliar],
    ["a druid's animal companion", () => createDruidWithCompanion(3), DetailedCharacterAnimalCompanion],
    ["a paladin's special mount", () => createPaladinWithMount(5), DetailedCharacterMount],
  ] as const)("%s has no general feat to pick, and no unspent slot", async (_, create, Kind) => {
    const { bonded } = await create();
    const detailed = await buildAs<DetailedCharacter>(Kind, bonded);
    expect(detailed.components.aptitudes.getAptitudes()["general"]).toMatchObject({
      allowed: 0,
      available: 0,
    });
    expect(detailed.validate().issues).toEqual([]);
  });

  test("reports what any character reports: a race's modifier on a path that doesn't resolve", async () => {
    const { ctx, bonded } = await createWizardWithFamiliar("Cat Familiar");
    await Modifiers.create(db, {
      sourceId: ctx.raceMap.familiar["Cat"],
      sourceType: "races",
      target: "combat.nosuchvalue.misc",
      operator: "add",
      value: "1",
      valueType: "number",
    });
    invalidateSeededRuleset(ctx.rulesetId);
    const cat = await buildAs(DetailedCharacterFamiliar, bonded);
    const { valid, issues } = cat.validate();
    expect(valid).toBe(false);
    expect(issues.filter((issue) => issue.message.includes("combat.nosuchvalue.misc"))).toHaveLength(1);
  });

  test("a companion loses a level with each of its druid's, its last, and goes with the level that picked it", async () => {
    const { ctx, masterId, bonded } = await createDruidWithCompanion(3);
    const companionLevels = async () =>
      (await CharacterLevels.findMany(db, { characterId: bonded.id })).map((level) => level.klassLevelId);
    const companionClassLevel = async (level: number) =>
      (await findKlassLevel(ctx.klassMap.animalcompanion["Animal Companion"], level))!.id;
    await CharacterLevelsService.removeLevel(owner, masterId);
    // Its third level goes, though the test's one transaction made all three at one creation time
    expect(await companionLevels()).toEqual([await companionClassLevel(1), await companionClassLevel(2)]);
    await CharacterLevelsService.removeLevel(owner, masterId);
    await CharacterLevelsService.removeLevel(owner, masterId);
    expect(await Characters.findOne(db, { parentCharacterId: masterId, kind: "animalcompanion" })).toBeUndefined();
  });

  test("a familiar has half its master's hit points, and their base attack and saves", async () => {
    const { masterId, bonded } = await createWizardWithFamiliar();
    const master = await buildAs(DetailedCharacter, (await Characters.findOne(db, { id: masterId }))!);
    const familiar = await buildAs(DetailedCharacterFamiliar, bonded);
    const numbers = (detailed: DetailedCharacter) => {
      const { hp, bab } = detailed.components.combat.getCombat();
      const saves = detailed.components.savingThrows.getSavingThrows();
      return { hp: hp.total, bab, saves: [saves.fortitude.base, saves.reflex.base, saves.will.base] };
    };
    const ofMaster = numbers(master);
    // A first-level wizard's base saves: poor Fortitude and Reflex, good Will.
    expect(ofMaster.saves).toEqual([0, 0, 2]);
    expect(numbers(familiar)).toEqual({ ...ofMaster, hp: Math.floor(ofMaster.hp / 2) });
  });

  test("a familiar changes with its master's pick, and goes with it", async () => {
    const { ctx, masterId, bonded: cat } = await createWizardWithFamiliar();
    const [level] = await CharacterLevels.findMany(db, { characterId: masterId });
    const pick = (familiar: string[], force = false) => {
      const { skills, feats, powers } = picks(ctx, picking(WIZARD_1, "Familiar Bond", familiar));
      return CharacterLevelsService.updateLevel(
        owner,
        masterId,
        level.id,
        WIZARD_1.hp,
        null,
        skills,
        feats,
        powers,
        force,
      );
    };
    await pick(["Owl Familiar"]);
    const owl = (await familiarOf(masterId))!;
    expect(owl.raceId).toBe(ctx.raceMap.familiar["Owl"]);
    expect(owl.id).not.toBe(cat.id);
    expect(await Characters.findOne(db, { id: cat.id })).toBeUndefined();

    // Without a pick, the master has a slot left to spend.
    await pick([], true);
    expect(await familiarOf(masterId)).toBeUndefined();
  });

  test("a familiar picked at two classes' levels is the later one's, however the earlier level is saved again", async () => {
    const { ctx, masterId } = await createWizardWithFamiliar();
    const [wizardLevel] = await CharacterLevels.findMany(db, { characterId: masterId });
    // A second character level: no General feat.
    await levelUp(owner, ctx, masterId, "Sorcerer", 1, { ...SORCERER_1, feats: { "Familiar Bond": ["Owl Familiar"] } });
    const master = await Characters.findOne(db, { id: masterId });
    const bond = (await buildAs(DetailedCharacter, master!)).components.aptitudes.getAptitudes()["familiarbond"];
    expect(bond).toMatchObject({ allowed: 2, spent: 2 });
    expect((await familiarOf(masterId))?.raceId).toBe(ctx.raceMap.familiar["Owl"]);

    const { skills, feats, powers } = picks(ctx, WIZARD_1);
    await CharacterLevelsService.updateLevel(owner, masterId, wizardLevel.id, WIZARD_1.hp, null, skills, feats, powers);
    expect((await familiarOf(masterId))?.raceId).toBe(ctx.raceMap.familiar["Owl"]);
    expect((await buildAs(DetailedCharacter, master!)).components.bonded.getBondedRace("familiar")).toBe("Owl");
  });

  test("a familiar picked straight in the database, without a level-up, is the master's", async () => {
    const ctx = await getSeedCtx();
    const masterId = await createSeedCharacter(ctx, "wizard");
    const levelIds = await addClassLevels(db, ctx, masterId, "Wizard", [1], [4]);
    await addFeats(db, ctx, levelIds, [{ levelIndex: 0, featName: "Raven Familiar", aptitude: "Familiar Bond" }]);
    const master = await buildAs(DetailedCharacter, (await Characters.findOne(db, { id: masterId }))!);
    expect(master.components.bonded.getBondedRace("familiar")).toBe("Raven");
  });

  test("a familiar is archived and restored with its master, and isn't listed or found on its own", async () => {
    const { masterId, bonded } = await createWizardWithFamiliar();
    const listed = (
      await Characters.findPage(
        db,
        { userId: SEED_USER_ID, visibility: Visibility.UnarchivedOnly },
        { limit: 200, page: 1 },
      )
    ).items.map((c) => c.id);
    expect(listed).toContain(masterId);
    expect(listed).not.toContain(bonded.id);
    expect(await Characters.findOne(db, { id: bonded.id, userId: SEED_USER_ID })).toBeUndefined();

    await Characters.archive(db, { id: masterId });
    expect(await Characters.findOne(db, { id: bonded.id }, Visibility.UnarchivedOnly)).toBeUndefined();
    await Characters.unarchive(db, { id: masterId });
    expect(await Characters.findOne(db, { id: bonded.id }, Visibility.UnarchivedOnly)).toBeDefined();
  });
});

describe("CharactersService with bonded creatures", () => {
  test("refuses a familiar's race for a new character, and a familiar's class for a level", async () => {
    const ctx = await getSeedCtx();
    const { session } = await createTestUser();
    await expect(
      CharactersService.createCharacter(session, {
        rulesetId: ctx.rulesetId,
        raceId: ctx.raceMap.familiar["Cat"],
        name: "Cat PC",
        xp: 0,
        alignment: "True Neutral",
        abilities: {},
        age: 1,
        gender: "Other",
        height: "0.3 m",
        weight: "5 kg",
      }),
    ).rejects.toThrow(BadRequestError);
    const wizardId = await createSeedCharacter(ctx, "wizard");
    await expect(addOneLevel(owner, wizardId, ctx.klassMap.familiar["Familiar"], 1, 4, null)).rejects.toThrow(
      BadRequestError,
    );
  });

  test("shows a master without a familiar with none, and one whose master is archived with it", async () => {
    const plain = await createSeedCharacter(await getSeedCtx(), "wizard");
    expect((await CharactersService.getCharacter(owner, plain)).bondedByKind).toEqual({});
    const { masterId } = await createWizardWithFamiliar();
    await CharactersService.archiveCharacter(owner, masterId);
    expect((await CharactersService.getCharacter(owner, masterId)).bondedByKind.familiar).toBeDefined();
  });

  test("opens a familiar on its own, for its master's player and contributors, even with the master archived", async () => {
    const { masterId, bonded } = await createWizardWithFamiliar();
    const { user, session: contributor } = await createTestUser();
    await addCharacterContributor(masterId, user, SEED_USER_ID);
    expect(await CharactersService.getCharacter(owner, bonded.id)).toMatchObject({
      character: { id: bonded.id, kind: "familiar" },
      bondedByKind: {},
    });
    expect((await CharactersService.getCharacter(contributor, bonded.id)).character.id).toBe(bonded.id);
    await expect(CharactersService.getCharacter((await createTestUser()).session, bonded.id)).rejects.toThrow(
      NotFoundError,
    );

    await CharactersService.archiveCharacter(owner, masterId);
    expect((await CharactersService.getCharacter(owner, bonded.id)).character.id).toBe(bonded.id);
  });

  test("renames a familiar and queues its PDF for its master's player and contributors, while the master isn't archived", async () => {
    const { masterId, bonded } = await createWizardWithFamiliar();
    const { user, session: contributor } = await createTestUser();
    await addCharacterContributor(masterId, user, SEED_USER_ID);
    await CharactersService.updateCharacter(owner, bonded.id, { name: "Whiskers" });
    await CharactersService.updateCharacter(contributor, bonded.id, { name: "Mittens" });
    expect((await Characters.findOne(db, { id: bonded.id }))?.name).toBe("Mittens");
    await expect(
      CharactersService.updateCharacter((await createTestUser()).session, bonded.id, { name: "Nope" }),
    ).rejects.toThrow(NotFoundError);
    await CharactersService.enqueuePdf(owner, bonded.id);
    expect(await queuedPdfJobs(bonded.id)).toMatchObject([
      { task: "generatePdf", payload: { characterId: bonded.id } },
    ]);

    await CharactersService.archiveCharacter(owner, masterId);
    await expect(CharactersService.updateCharacter(owner, bonded.id, { name: "Ghost" })).rejects.toThrow(NotFoundError);
    await expect(CharactersService.enqueuePdf(owner, bonded.id)).rejects.toThrow(NotFoundError);
  });

  test("shares a master with their familiar", async () => {
    const { masterId } = await createWizardWithFamiliar();
    const { shareToken } = await CharacterSharingService.generateShareToken(owner, masterId);
    expect((await CharacterSharingService.getSharedCharacter(shareToken!)).bondedByKind.familiar).toBeDefined();
  });

  test.each([
    ["archive", (id: string) => CharactersService.archiveCharacter(owner, id)],
    ["unarchive", (id: string) => CharactersService.unarchiveCharacter(owner, id)],
    ["share", (id: string) => CharacterSharingService.generateShareToken(owner, id)],
    ["stop sharing", (id: string) => CharacterSharingService.revokeShareToken(owner, id)],
    [
      "list the contributors of",
      (id: string) => CharacterContributorsService.getContributors(owner, id, {}, { limit: 10, page: 1 }),
    ],
    [
      "invite a contributor to",
      (id: string) => CharacterContributorsService.inviteContributor(owner, id, "anyone@example.com"),
    ],
    ["leave", (id: string) => CharacterContributorsService.leaveCharacter(owner, id)],
    // Its levels follow its master's, never a pick: the level-up builds a player character
    [
      "list the classes for",
      (id: string) => CharacterLevelsService.getAvailableKlasses(owner, id, {}, { limit: 10, page: 1 }),
    ],
    [
      "count the feat slots of",
      async (id: string) => CharacterLevelsService.getFeatSlots(owner, id, (await getSeedCtx()).klassMap.pc.Wizard, 2),
    ],
    ["level up", async (id: string) => addOneLevel(owner, id, (await getSeedCtx()).klassMap.pc.Wizard, 2, 4, null)],
    ["remove a level from", (id: string) => CharacterLevelsService.removeLevel(owner, id)],
    ["set the ability scores of", (id: string) => CharactersService.updateAbilities(owner, id, {})],
    ["list the inventory of", (id: string) => CharacterInventoryService.getInventory(owner, id)],
    ["list the modifiers of", (id: string) => CharacterModifiersService.getModifiers(owner, id)],
  ])("won't %s a familiar on its own", async (_, call) => {
    const { bonded } = await createWizardWithFamiliar();
    await expect(call(bonded.id)).rejects.toThrow(NotFoundError);
  });

  test("shows a campaign character's familiar, unless the character is partly hidden from the other players", async () => {
    const bondedIn = async (visibility: "Public" | "Partial", viewerRole?: "Player Character") => {
      const { masterId } = await createWizardWithFamiliar();
      const { campaign } = await createTestCampaign(SEED_USER_ID);
      await CampaignCharactersService.linkCharacter(owner, campaign.id, masterId, visibility);
      let viewer = owner;
      if (viewerRole) {
        const { user, session } = await createTestUser();
        await Players.create(db, { userId: user.id, campaignId: campaign.id, role: viewerRole });
        viewer = session;
      }
      return Object.keys(
        (await CampaignCharactersService.getCharacter(viewer, campaign.id, masterId)).bondedByKind ?? {},
      );
    };
    expect(await bondedIn("Public")).toEqual(["familiar"]);
    expect(await bondedIn("Partial", "Player Character")).toEqual([]);
  });
});

describe("A familiar's benefit", () => {
  test("goes to its master, by the SRD's familiar table, and not to the familiar", async () => {
    const masterOf = async (masterId: string) => {
      const master = await buildAs(DetailedCharacter, (await Characters.findOne(db, { id: masterId }))!);
      return master;
    };
    // A cat's master: +3 Move Silently; a weasel's: +2 Reflex
    const cat = await createWizardWithFamiliar("Cat Familiar");
    const catMaster = await masterOf(cat.masterId);
    expect(catMaster.components.skills.getSkills()["movesilently"].misc).toBe(3);
    const weasel = await createWizardWithFamiliar("Weasel Familiar");
    const weaselMaster = await masterOf(weasel.masterId);
    expect(weaselMaster.components.savingThrows.getSavingThrows()["reflex"].misc).toBe(2);

    // The familiar keeps its SRD stat block: neither its master's bonus nor the Alertness its master gains
    const familiar = await buildAs(DetailedCharacterFamiliar, cat.bonded);
    const feats = familiar.components.feats.getFeats() as Record<string, { possessed?: boolean }>;
    expect([feats["alertness"]?.possessed, feats["alertnessfamiliar"]?.possessed]).toEqual([false, true]);
    expect(familiar.components.skills.getSkills()["movesilently"].total).toBe(8);
  });
});

describe("Stat blocks", () => {
  test("count a stat block's feats and list them with the creature's granted feats, as any granted feat", async () => {
    // A druid 12's dog: 9 hit dice, so Alertness and three feats from its priority, Toughness among them
    const dog = await buildAs(
      DetailedCharacterAnimalCompanion,
      (await createDruidWithCompanion(12, "Dog Animal Companion")).bonded,
    );
    expect(dog.components.feats.getFeat("Toughness")).toMatchObject({ possessed: true, count: 1 });
    expect(dog.components.feats.getFeat("Alertness")).toMatchObject({ possessed: true, count: 1 });
    expect(dog.getVirtuallyPossessedFeats().map((feat) => feat.name)).toEqual(
      expect.arrayContaining(["Alertness", "Toughness"]),
    );
  });

  test("leave a stat block's feat the creature already has as it is: counted once, its bonus once", async () => {
    // A druid 12's dog takes Improved Initiative (+4 initiative) from its priority, and a modifier grants it as well
    const { bonded } = await createDruidWithCompanion(12, "Dog Animal Companion");
    const initiative = (dog: DetailedCharacter) => dog.components.combat.getCombat().initiative.total;
    const before = initiative(await buildAs(DetailedCharacterAnimalCompanion, bonded));
    await Modifiers.create(db, {
      sourceId: bonded.id,
      sourceType: "characters",
      target: "feats.improvedinitiative.possessed",
      operator: "set",
      value: "true",
      valueType: "boolean",
    });
    const dog = await buildAs(DetailedCharacterAnimalCompanion, bonded);
    expect(dog.components.feats.getFeat("Improved Initiative")).toMatchObject({ possessed: true, count: 1 });
    expect(dog.getVirtuallyPossessedFeats().filter((feat) => feat.name === "Improved Initiative")).toHaveLength(1);
    expect(initiative(dog)).toBe(before);
  });

  test("count a stat-block feat's skill bonus once, though a modifier grants the creature the feat as well", async () => {
    // A druid 12's dog: its Listen and Spot count its Alertness, which its own modifier grants it again
    const { bonded } = await createDruidWithCompanion(12, "Dog Animal Companion");
    const awareness = (dog: DetailedCharacter) => {
      const { listen, spot } = dog.components.skills.getSkills();
      return [listen.total, spot.total];
    };
    const before = awareness(await buildAs(DetailedCharacterAnimalCompanion, bonded));
    await Modifiers.create(db, {
      sourceId: bonded.id,
      sourceType: "characters",
      target: "feats.alertness.possessed",
      operator: "set",
      value: "true",
      valueType: "boolean",
    });
    expect(awareness(await buildAs(DetailedCharacterAnimalCompanion, bonded))).toEqual(before);
  });

  test("give a stat-block feat's skill bonus as the ruleset has it, in place of the SRD's the total counts", async () => {
    const { ctx, bonded } = await createDruidWithCompanion(12, "Dog Animal Companion");
    const listen = async () =>
      (await buildAs(DetailedCharacterAnimalCompanion, bonded)).components.skills.getSkills().listen.total;
    const before = await listen();
    const alertness = await Modifiers.findMany(db, { sourceIds: [ctx.featMap["Alertness"]] });
    const onListen = alertness.find((modifier) => modifier.target === "skills.listen.misc")!;
    await Modifiers.update(db, { value: "3" }, { id: onListen.id });
    invalidateSeededRuleset(ctx.rulesetId);
    // The SRD's +2 comes out of the printed total, the ruleset's +3 goes in
    expect(await listen()).toBe(before + 1);
  });

  test("replace the creature's weapons with its natural attacks: no item group reaches a weapon it no longer has", async () => {
    const cat = await buildAs(DetailedCharacterFamiliar, (await createWizardWithFamiliar("Cat Familiar")).bonded);
    expect(cat.components.combat.getCombat().weaponsets["0"]?.mainhand?.name).not.toBe("Unarmed Strike");
    expect(cat.components.weapons.getWeapons()).toEqual({});
    expect(new Dnd35TargetPaths().traversePathInit("items.weapons.unarmedstrike.damage", cat.components)).toEqual([]);
  });

  test("take a familiar's own modifiers on top: its master and stat block set it up before they apply", async () => {
    // A modifier on the cat race: +3 hit points and +2 Intelligence, which the master's derivation used to reset
    const { ctx, bonded } = await createWizardWithFamiliar("Cat Familiar");
    const catRaceId = ctx.raceMap.familiar["Cat"];
    for (const target of ["combat.hp.misc", "abilities.intelligence.misc"]) {
      await Modifiers.create(db, {
        sourceId: catRaceId,
        sourceType: "races",
        target,
        operator: "add",
        value: target.startsWith("combat") ? "3" : "2",
        valueType: "number",
      });
    }
    invalidateSeededRuleset(ctx.rulesetId);
    const cat = await buildAs(DetailedCharacterFamiliar, bonded);
    expect(cat.components.combat.getCombat().hp.misc).toBe(3);
    expect(cat.components.abilities.getAbilities()["intelligence"].misc).toBe(2);
  });

  test("a four-legged creature carries more for its size than a biped, as its race says", async () => {
    const heavyLoad = (detailed: DetailedCharacter) => {
      const strength = detailed.components.abilities.getAbilities()["strength"].total;
      return {
        capacity: CARRYING_CAPACITY[strength],
        heavy: detailed.components.encumbrance.getEncumbrance().heavyload,
      };
    };
    // Large and Medium quadrupeds: x3 and x1 1/2 (a biped's x2 and x1).
    const mount = heavyLoad(await buildAs(DetailedCharacterMount, (await createPaladinWithMount(5)).bonded));
    expect(mount.heavy).toBe(mount.capacity * 3);
    const wolf = heavyLoad(await buildAs(DetailedCharacterAnimalCompanion, (await createDruidWithCompanion(1)).bonded));
    expect(wolf.heavy).toBe(Math.floor(wolf.capacity * 1.5));
    // Tiny: a cat on four legs x3/4, a hawk on two x1/2.
    const cat = heavyLoad(await buildAs(DetailedCharacterFamiliar, (await createWizardWithFamiliar()).bonded));
    expect(cat.heavy).toBe(Math.floor(cat.capacity * 0.75));
    const hawk = heavyLoad(
      await buildAs(DetailedCharacterFamiliar, (await createWizardWithFamiliar("Hawk Familiar")).bonded),
    );
    expect(hawk.heavy).toBe(Math.floor(hawk.capacity * 0.5));
  });

  test.each([
    "Badger",
    "Camel",
    "Dire Rat",
    "Dog",
    "Riding Dog",
    "Eagle",
    "Hawk",
    "Horse, Light",
    "Horse, Heavy",
    "Owl",
    "Pony",
    "Snake, Small Viper",
    "Snake, Medium Viper",
    "Wolf",
  ])("a druid 1's %s companion has its stat block's skills, racial bonuses included", async (race) => {
    const { bonded } = await createDruidWithCompanion(1, `${race} Animal Companion`);
    const skills = (await buildAs(DetailedCharacterAnimalCompanion, bonded)).components.skills.getSkills();
    const totals = getBondedRaceStats(race)!.baseSkillTotals!;
    expect(
      Object.fromEntries(Object.keys(totals).map((skill) => [skill, skills[stripSeparators(skill)]?.total])),
    ).toEqual(totals);
  });

  test("a companion's added hit dice give its skills a rank each in turn, and its Dexterity bonus and new feats add on", async () => {
    // A druid 7's companion has 4 more hit dice and +2 Dexterity. The owl's points go to Move Silently, Listen, Spot,
    // the last two beside its stat block's 2 ranks
    const owl = (
      await buildAs(
        DetailedCharacterAnimalCompanion,
        (await createDruidWithCompanion(7, "Owl Animal Companion")).bonded,
      )
    ).components.skills.getSkills();
    expect([owl.movesilently, owl.listen, owl.spot].map(({ rank, total }) => ({ rank, total }))).toEqual([
      { rank: 2, total: 17 + 2 + 1 },
      { rank: 2 + 1, total: 14 + 1 },
      { rank: 2 + 1, total: 6 + 1 },
    ]);
    // A light horse of 7 hit dice gains Alertness, its third feat: +2 Listen beside its 2 ranks
    const horse = (
      await buildAs(
        DetailedCharacterAnimalCompanion,
        (await createDruidWithCompanion(7, "Horse, Light Animal Companion")).bonded,
      )
    ).components.skills.getSkills();
    expect(horse.listen).toMatchObject({ rank: 2, total: 4 + 2 + 2 });
  });

  test("a cat familiar has the SRD cat's skills, and a tiny creature's size bonuses", async () => {
    const cat = await buildAs(DetailedCharacterFamiliar, (await createWizardWithFamiliar("Cat Familiar")).bonded);
    const skills = cat.components.skills.getSkills();
    expect(
      Object.fromEntries(
        ["balance", "climb", "hide", "jump", "listen", "movesilently", "spot"].map((skill) => [
          skill,
          skills[skill]?.total,
        ]),
      ),
    ).toEqual({ balance: 10, climb: 6, hide: 16, jump: 10, listen: 3, movesilently: 8, spot: 3 });
    expect(skills["hide"]?.size).toBe(8);

    const { ac, weaponsets } = cat.components.combat.getCombat();
    expect(ac.size).toBe(2);
    expect(ac.total).toBe(
      ac.base + ac.armor + ac.shield + ac.dexterity + ac.natural + ac.deflection + ac.size + ac.misc,
    );
    const claws = weaponsets["0"]?.mainhand ?? weaponsets["0"]?.offhand;
    if (claws) expect(claws.tohit.size).toBe(2);
    // Claws and a bite aren't two weapons: no two-weapon penalties
    expect(weaponsets["0"]).toMatchObject({ mainhand: { twoweapon: null }, offhand: { twoweapon: null } });
  });

  test.each([
    // The Monster Manual wolf, with the first row of the companion table: no bonus.
    [1, { natural: 2, bab: 1 }],
    // The 3-5 row: 2 more hit dice (4 in all), +2 natural armor, +1 Strength and Dexterity.
    [
      3,
      {
        hp: 18,
        bab: 3,
        natural: 4,
        size: 0,
        ac: 17,
        saves: { fortitude: 6, reflex: 7, will: 2 },
        abilities: { misc: [1, 1] },
        // Its only natural attack adds one and a half its Strength bonus (+2), and Weapon Focus (bite) its +1
        attack: { name: "Bite", size: 0, toHit: 6, damage: "1d6 + 3" },
      },
    ],
  ])("a druid %i's wolf companion", async (druidLevel, expected) => {
    const { bonded } = await createDruidWithCompanion(druidLevel);
    expect(statBlock(await buildAs(DetailedCharacterAnimalCompanion, bonded))).toMatchObject(expected);
  });

  test("a familiar uses its master's skill ranks where they're better, with its own ability modifiers", async () => {
    // A wizard with 4 ranks in Concentration and Spellcraft, and a cat familiar: Constitution 10, Intelligence 6
    const skills = (
      await buildAs(DetailedCharacterFamiliar, (await createWizardWithFamiliar("Cat Familiar")).bonded)
    ).components.skills.getSkills();
    expect(skills["concentration"]).toMatchObject({ rank: 4, total: 4 });
    expect(skills["spellcraft"]).toMatchObject({ rank: 4, total: 4 - 2, trained: true });
    // Its own 2 ranks in Listen beat its master's none: its stat block's total
    expect(skills["listen"]).toMatchObject({ rank: 2, total: 3 });
  });

  test("a natural attack is primary or secondary, as its stat block has it, and attacks once", async () => {
    // A cat familiar: two claws, then a bite at -5, which adds half its Strength bonus (a penalty in full)
    const cat = (
      await buildAs(DetailedCharacterFamiliar, (await createWizardWithFamiliar("Cat Familiar")).bonded)
    ).components.combat.getCombat();
    const { mainhand: claws, offhand: bite } = cat.weaponsets["0"];
    expect(claws).toMatchObject({ name: "Claw (x2)", natural: "primary" });
    expect(bite).toMatchObject({
      name: "Bite",
      natural: "secondary",
      damage: { strmultiplier: 0.5 },
    });
    // Its −5: `combat.naturalattacks.secondarypenalty`
    expect(bite!.tohit.total).toEqual([claws!.tohit.total[0] - 5]);
    // A paladin 5's heavy warhorse: its hooves primary, its bite secondary
    const horse = (
      await buildAs(DetailedCharacterMount, (await createPaladinWithMount(5)).bonded)
    ).components.combat.getCombat().weaponsets["0"];
    expect([horse.mainhand?.natural, horse.offhand?.natural]).toEqual(["primary", "secondary"]);
  });

  test("a druid 9's companion has Multiattack: -2 on its secondary attacks, or a second primary attack under three", async () => {
    const combat = async (companion: string, druidLevel = 9) =>
      (
        await buildAs(DetailedCharacterAnimalCompanion, (await createDruidWithCompanion(druidLevel, companion)).bonded)
      ).components.combat.getCombat();
    // A druid 12's badger: two claws and a bite, its bite at -2. Its base attack bonus past +5 gives no other attack
    const badger = await combat("Badger Animal Companion", 12);
    expect(badger.naturalattacks).toMatchObject({ count: 3, secondarypenalty: -2, extraattacks: 0 });
    const { mainhand: claws, offhand: bite } = badger.weaponsets["0"];
    expect(badger.bab).toBeGreaterThan(5);
    expect(claws!.tohit.total).toHaveLength(1);
    expect(bite!.tohit.total).toEqual([claws!.tohit.total[0] - 2]);
    // A wolf's lone bite: a second one at -5
    const wolf = await combat("Wolf Animal Companion");
    expect(wolf.naturalattacks).toMatchObject({ count: 1, secondarypenalty: -5, extraattacks: 1 });
    const [first, second] = wolf.weaponsets["0"].mainhand!.tohit.total;
    expect(second).toBe(first - 5);
  });

  test.each([
    // The 5-7 row: 2 more hit dice (6 in all), +4 natural armor, +1 Strength, Intelligence 6.
    [
      5,
      {
        bab: 4,
        natural: 8,
        size: -1,
        ac: 18,
        baseSaves: { fortitude: 5, reflex: 5, will: 2 },
        abilities: { strength: 19, intelligence: 6 },
      },
    ],
    // The 8-10 row: +6 natural armor, +2 Strength, Intelligence 7.
    [8, { natural: 10, abilities: { strength: 20, intelligence: 7 } }],
    // It shares the paladin's better Fortitude: 7 at the 10th level, against its own 6.
    [10, { baseSaves: { fortitude: 7 } }],
  ])("a paladin %i's heavy warhorse", async (paladinLevel, expected) => {
    const { bonded } = await createPaladinWithMount(paladinLevel);
    expect(statBlock(await buildAs(DetailedCharacterMount, bonded))).toMatchObject(expected);
  });
});
