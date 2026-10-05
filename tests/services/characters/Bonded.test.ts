import { describe, expect, test } from "bun:test";

import { addClassLevels, addFeats, SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { CharacterLevels, Characters, Modifiers, Players } from "@/server/repositories/index.ts";
import { CARRYING_CAPACITY } from "@/server/rulesets/constants.ts";
import DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import DetailedCharacterAnimalCompanion from "@/server/rulesets/dnd3.5/DetailedCharacterAnimalCompanion.ts";
import DetailedCharacterFamiliar from "@/server/rulesets/dnd3.5/DetailedCharacterFamiliar.ts";
import DetailedCharacterMount from "@/server/rulesets/dnd3.5/DetailedCharacterMount.ts";
import { getBondedRaceStats } from "@/server/rulesets/dnd3.5/index.ts";
import { CampaignCharactersService } from "@/server/services/campaigns/characters/index.ts";
import { CharacterContributorsService } from "@/server/services/characters/contributors/index.ts";
import { CharactersService } from "@/server/services/characters/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";
import { CharacterSharingService } from "@/server/services/characters/sharing/index.ts";
import { stripSeparators } from "@/shared/text.ts";
import {
  addCharacterContributor,
  addOneLevel,
  createTestCampaign,
  createTestUser,
  getSeedCtx,
  invalidateSeededRuleset,
  makeSession,
  queuedPdfJobs,
} from "@/tests/helpers.ts";
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
} from "@/tests/levelFixtures.ts";

const owner = makeSession();
const familiarOf = (masterId: string) => Characters.findOne(db, { parentCharacterId: masterId, kind: "familiar" });

async function build<T extends { build(): Promise<unknown> }>(detailed: T) {
  await detailed.build();
  return detailed;
}

/** A bonded creature's numbers, as its sheet shows them. */
function statBlock(detailed: DetailedCharacterMount | DetailedCharacterAnimalCompanion) {
  const { hp, bab, ac, weaponsets } = detailed.getDetailedCharacterCombat().getCombat();
  const saves = detailed.getDetailedCharacterSavingThrows().getSavingThrows();
  const abilities = detailed.getDetailedCharacterAbilities().getAbilities();
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

  test("a companion loses a level with each of its druid's, and goes with the level that picked it", async () => {
    const { masterId, bonded } = await createDruidWithCompanion(3);
    const companionLevels = async () => (await CharacterLevels.findMany(db, { characterId: bonded.id })).length;
    await CharacterLevelsService.removeLevel(owner, masterId);
    expect(await companionLevels()).toBe(2);
    await CharacterLevelsService.removeLevel(owner, masterId);
    await CharacterLevelsService.removeLevel(owner, masterId);
    expect(await Characters.findOne(db, { parentCharacterId: masterId, kind: "animalcompanion" })).toBeUndefined();
  });

  test("a familiar has half its master's hit points, and their base attack and saves", async () => {
    const { masterId, bonded } = await createWizardWithFamiliar();
    const master = await build(new DetailedCharacter((await Characters.findOne(db, { id: masterId }))!));
    const familiar = await build(new DetailedCharacterFamiliar(bonded));
    const numbers = (detailed: DetailedCharacter) => {
      const { hp, bab } = detailed.getDetailedCharacterCombat().getCombat();
      const saves = detailed.getDetailedCharacterSavingThrows().getSavingThrows();
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
    const bond = (await build(new DetailedCharacter(master!))).getDetailedCharacterAptitudes().getAptitudes()[
      "familiarbond"
    ];
    expect(bond).toMatchObject({ allowed: 2, spent: 2 });
    expect((await familiarOf(masterId))?.raceId).toBe(ctx.raceMap.familiar["Owl"]);

    const { skills, feats, powers } = picks(ctx, WIZARD_1);
    await CharacterLevelsService.updateLevel(owner, masterId, wizardLevel.id, WIZARD_1.hp, null, skills, feats, powers);
    expect((await familiarOf(masterId))?.raceId).toBe(ctx.raceMap.familiar["Owl"]);
    expect((await build(new DetailedCharacter(master!))).getDetailedCharacterBonds().getBondedRace("familiar")).toBe(
      "Owl",
    );
  });

  test("a familiar picked straight in the database, without a level-up, is the master's", async () => {
    const ctx = await getSeedCtx();
    const masterId = await createSeedCharacter(ctx, "wizard");
    const levelIds = await addClassLevels(db, ctx, masterId, "Wizard", [1], [4]);
    await addFeats(db, ctx, levelIds, [{ levelIndex: 0, featName: "Raven Familiar", aptitude: "Familiar Bond" }]);
    const master = await build(new DetailedCharacter((await Characters.findOne(db, { id: masterId }))!));
    expect(master.getDetailedCharacterBonds().getBondedRace("familiar")).toBe("Raven");
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
      const master = new DetailedCharacter((await Characters.findOne(db, { id: masterId }))!);
      await master.build();
      return master;
    };
    // A cat's master: +3 Move Silently; a weasel's: +2 Reflex
    const cat = await createWizardWithFamiliar("Cat Familiar");
    const catMaster = await masterOf(cat.masterId);
    expect(catMaster.getDetailedCharacterSkills().getSkills()["movesilently"].misc).toBe(3);
    const weasel = await createWizardWithFamiliar("Weasel Familiar");
    const weaselMaster = await masterOf(weasel.masterId);
    expect(weaselMaster.getDetailedCharacterSavingThrows().getSavingThrows()["reflex"].misc).toBe(2);

    // The familiar keeps its SRD stat block: neither its master's bonus nor the Alertness its master gains
    const familiar = await build(new DetailedCharacterFamiliar(cat.bonded));
    const feats = familiar.getDetailedCharacterFeats().getFeats() as Record<string, { possessed?: boolean }>;
    expect([feats["alertness"]?.possessed, feats["alertnessfamiliar"]?.possessed]).toEqual([false, true]);
    expect(familiar.getDetailedCharacterSkills().getSkills()["movesilently"].total).toBe(8);
  });
});

describe("Stat blocks", () => {
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
    const cat = await build(new DetailedCharacterFamiliar(bonded));
    expect(cat.getDetailedCharacterCombat().getCombat().hp.misc).toBe(3);
    expect(cat.getDetailedCharacterAbilities().getAbilities()["intelligence"].misc).toBe(2);
  });

  test("a four-legged creature carries more for its size than a biped, as its race says", async () => {
    const heavyLoad = (detailed: DetailedCharacter) => {
      const strength = detailed.getDetailedCharacterAbilities().getAbilities()["strength"].total;
      return {
        capacity: CARRYING_CAPACITY[strength],
        heavy: detailed.getDetailedCharacterEncumbrance().getEncumbrance().heavyload,
      };
    };
    // Large and Medium quadrupeds: x3 and x1 1/2 (a biped's x2 and x1).
    const mount = heavyLoad(await build(new DetailedCharacterMount((await createPaladinWithMount(5)).bonded)));
    expect(mount.heavy).toBe(mount.capacity * 3);
    const wolf = heavyLoad(
      await build(new DetailedCharacterAnimalCompanion((await createDruidWithCompanion(1)).bonded)),
    );
    expect(wolf.heavy).toBe(Math.floor(wolf.capacity * 1.5));
    // Tiny: a cat on four legs x3/4, a hawk on two x1/2.
    const cat = heavyLoad(await build(new DetailedCharacterFamiliar((await createWizardWithFamiliar()).bonded)));
    expect(cat.heavy).toBe(Math.floor(cat.capacity * 0.75));
    const hawk = heavyLoad(
      await build(new DetailedCharacterFamiliar((await createWizardWithFamiliar("Hawk Familiar")).bonded)),
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
    const skills = (await build(new DetailedCharacterAnimalCompanion(bonded))).getDetailedCharacterSkills().getSkills();
    const totals = getBondedRaceStats(race)!.baseSkillTotals!;
    expect(
      Object.fromEntries(Object.keys(totals).map((skill) => [skill, skills[stripSeparators(skill)]?.total])),
    ).toEqual(totals);
  });

  test("a companion's added hit dice give its skills a rank each in turn, and its Dexterity bonus and new feats add on", async () => {
    // A druid 7's companion has 4 more hit dice and +2 Dexterity. The owl's points go to Move Silently, Listen, Spot,
    // the last two beside its stat block's 2 ranks
    const owl = (
      await build(
        new DetailedCharacterAnimalCompanion((await createDruidWithCompanion(7, "Owl Animal Companion")).bonded),
      )
    )
      .getDetailedCharacterSkills()
      .getSkills();
    expect([owl.movesilently, owl.listen, owl.spot].map(({ rank, total }) => ({ rank, total }))).toEqual([
      { rank: 2, total: 17 + 2 + 1 },
      { rank: 2 + 1, total: 14 + 1 },
      { rank: 2 + 1, total: 6 + 1 },
    ]);
    // A light horse of 7 hit dice gains Alertness, its third feat: +2 Listen beside its 2 ranks
    const horse = (
      await build(
        new DetailedCharacterAnimalCompanion(
          (await createDruidWithCompanion(7, "Horse, Light Animal Companion")).bonded,
        ),
      )
    )
      .getDetailedCharacterSkills()
      .getSkills();
    expect(horse.listen).toMatchObject({ rank: 2, total: 4 + 2 + 2 });
  });

  test("a cat familiar has the SRD cat's skills, and a tiny creature's size bonuses", async () => {
    const cat = await build(new DetailedCharacterFamiliar((await createWizardWithFamiliar("Cat Familiar")).bonded));
    const skills = cat.getDetailedCharacterSkills().getSkills();
    expect(
      Object.fromEntries(
        ["balance", "climb", "hide", "jump", "listen", "movesilently", "spot"].map((skill) => [
          skill,
          skills[skill]?.total,
        ]),
      ),
    ).toEqual({ balance: 10, climb: 6, hide: 16, jump: 10, listen: 3, movesilently: 8, spot: 3 });
    expect(skills["hide"]?.size).toBe(8);

    const { ac, weaponsets } = cat.getDetailedCharacterCombat().getCombat();
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
    expect(statBlock(await build(new DetailedCharacterAnimalCompanion(bonded)))).toMatchObject(expected);
  });

  test("a familiar uses its master's skill ranks where they're better, with its own ability modifiers", async () => {
    // A wizard with 4 ranks in Concentration and Spellcraft, and a cat familiar: Constitution 10, Intelligence 6
    const skills = (await build(new DetailedCharacterFamiliar((await createWizardWithFamiliar("Cat Familiar")).bonded)))
      .getDetailedCharacterSkills()
      .getSkills();
    expect(skills["concentration"]).toMatchObject({ rank: 4, total: 4 });
    expect(skills["spellcraft"]).toMatchObject({ rank: 4, total: 4 - 2, trained: true });
    // Its own 2 ranks in Listen beat its master's none: its stat block's total
    expect(skills["listen"]).toMatchObject({ rank: 2, total: 3 });
  });

  test("a natural attack is primary or secondary, as its stat block has it, and attacks once", async () => {
    // A cat familiar: two claws, then a bite at -5, which adds half its Strength bonus (a penalty in full)
    const cat = (await build(new DetailedCharacterFamiliar((await createWizardWithFamiliar("Cat Familiar")).bonded)))
      .getDetailedCharacterCombat()
      .getCombat();
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
    const horse = (await build(new DetailedCharacterMount((await createPaladinWithMount(5)).bonded)))
      .getDetailedCharacterCombat()
      .getCombat().weaponsets["0"];
    expect([horse.mainhand?.natural, horse.offhand?.natural]).toEqual(["primary", "secondary"]);
  });

  test("a druid 9's companion has Multiattack: -2 on its secondary attacks, or a second primary attack under three", async () => {
    const combat = async (companion: string, druidLevel = 9) =>
      (
        await build(
          new DetailedCharacterAnimalCompanion((await createDruidWithCompanion(druidLevel, companion)).bonded),
        )
      )
        .getDetailedCharacterCombat()
        .getCombat();
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
    expect(statBlock(await build(new DetailedCharacterMount(bonded)))).toMatchObject(expected);
  });
});
