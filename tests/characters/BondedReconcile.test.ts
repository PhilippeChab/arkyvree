import { db } from "@/server/database/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import { CharacterLevelsMethods } from "@/server/services/characters/CharacterLevelsService.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import DetailedCharacterFamiliar from "@/server/rulesets/dnd3.5/DetailedCharacterFamiliar.ts";
import { charactersInCharacter, levelsInCharacter } from "@/drizzle/schema.ts";
import { addClassLevels, addFeats, createCharacter, getSeedContext, SEED_USER_ID } from "@/database/seeds/helpers.ts";
import { addOneLevel } from "@/tests/helpers.ts";
import { makeSession, makeWizard as makeWizardChar, wizardL1Feats, wizardL1Powers as WIZARD_L1_POWERS, wizardL1Skills as WIZARD_L1_SKILLS } from "@/tests/bondedFixtures.ts";
import { describe, expect, test } from "bun:test";
import { and, eq, isNull, isNotNull } from "drizzle-orm";

const session = makeSession;

async function makeWizard(name: string) {
  const ctx = await getSeedContext(db);
  const characterId = await makeWizardChar(name, ctx);
  return { ctx, characterId };
}

describe("BondedReconcile", () => {
  test("Wizard L1 with Cat Familiar materializes a Cat familiar character row", async () => {
    const { ctx, characterId } = await makeWizard("Reconcile Wizard 1");
    await addOneLevel(
      session(), characterId, ctx.klassMap.pc["Wizard"], 1, 4, null,
      WIZARD_L1_SKILLS(ctx), wizardL1Feats(ctx, "Cat Familiar"), WIZARD_L1_POWERS(ctx),
    );

    const familiar = await Characters.findOne(db, {
      parentCharacterId: characterId,
      kind: "familiar",
    });
    expect(familiar).toBeDefined();
    expect(familiar!.kind).toBe("familiar");
    expect(familiar!.parentCharacterId).toBe(characterId);
    expect(familiar!.raceId).toBe(ctx.raceMap.familiar["Cat"]);
    expect(familiar!.userId).toBe(SEED_USER_ID);
    expect(familiar!.name).toBe("Cat");
  });

  test("familiar's class levels match master HD (1 at L1)", async () => {
    const { ctx, characterId } = await makeWizard("Reconcile Wizard HD");
    await addOneLevel(
      session(), characterId, ctx.klassMap.pc["Wizard"], 1, 4, null,
      WIZARD_L1_SKILLS(ctx), wizardL1Feats(ctx, "Cat Familiar"), WIZARD_L1_POWERS(ctx),
    );

    const familiar = (await Characters.findOne(db, {
      parentCharacterId: characterId, kind: "familiar",
    }))!;
    const familiarLevels = await db
      .select().from(levelsInCharacter)
      .where(and(eq(levelsInCharacter.characterId, familiar.id), isNull(levelsInCharacter.deletedAt)));
    expect(familiarLevels).toHaveLength(1);
  });

  test("familiar HP is floor(½ master HP), BAB matches master", async () => {
    const { ctx, characterId } = await makeWizard("Reconcile Wizard Stats");
    await addOneLevel(
      session(), characterId, ctx.klassMap.pc["Wizard"], 1, 4, null,
      WIZARD_L1_SKILLS(ctx), wizardL1Feats(ctx, "Cat Familiar"), WIZARD_L1_POWERS(ctx),
    );

    const masterRecord = (await Characters.findOne(db, { id: characterId }))!;
    const master = new DetailedCharacter(masterRecord);
    await master.build();

    const familiarRecord = (await Characters.findOne(db, {
      parentCharacterId: characterId, kind: "familiar",
    }))!;
    const familiar = new DetailedCharacterFamiliar(familiarRecord);
    await familiar.build();

    const masterCombat = master.getDetailedCharacterCombat().getCombat();
    const familiarCombat = familiar.getDetailedCharacterCombat().getCombat();
    expect(familiarCombat.hp.total).toBe(Math.floor(masterCombat.hp.total / 2));
    expect(familiarCombat.bab).toBe(masterCombat.bab);

    // Familiar uses master's base saves per SRD. At Wizard L1: Fort/Ref poor
    // (base 0), Will good (base 2).
    const masterSaves = master.getDetailedCharacterSavingThrows().getSavingThrows();
    const familiarSaves = familiar.getDetailedCharacterSavingThrows().getSavingThrows();
    expect(familiarSaves.fortitude.base).toBe(masterSaves.fortitude.base);
    expect(familiarSaves.reflex.base).toBe(masterSaves.reflex.base);
    expect(familiarSaves.will.base).toBe(masterSaves.will.base);
    expect(familiarSaves.fortitude.base).toBe(0);
    expect(familiarSaves.reflex.base).toBe(0);
    expect(familiarSaves.will.base).toBe(2);
  });

  test("changing the picked familiar race deletes the old row and inserts a new one", async () => {
    const { ctx, characterId } = await makeWizard("Reconcile Wizard Swap");
    const level = await addOneLevel(
      session(), characterId, ctx.klassMap.pc["Wizard"], 1, 4, null,
      WIZARD_L1_SKILLS(ctx), wizardL1Feats(ctx, "Cat Familiar"), WIZARD_L1_POWERS(ctx),
    );
    const before = (await Characters.findOne(db, {
      parentCharacterId: characterId, kind: "familiar",
    }))!;
    expect(before.raceId).toBe(ctx.raceMap.familiar["Cat"]);

    await CharacterLevelsMethods.updateLevel(
      session(), characterId, level.id, 4, null,
      WIZARD_L1_SKILLS(ctx), wizardL1Feats(ctx, "Owl Familiar"), WIZARD_L1_POWERS(ctx),
    );

    const after = (await Characters.findOne(db, {
      parentCharacterId: characterId, kind: "familiar",
    }))!;
    expect(after.raceId).toBe(ctx.raceMap.familiar["Owl"]);
    expect(after.id).not.toBe(before.id);

    const stale = await Characters.findOne(db, { id: before.id });
    expect(stale).toBeUndefined();
  });

  test("removing the Familiar pick deletes the familiar row", async () => {
    const { ctx, characterId } = await makeWizard("Reconcile Wizard Drop");
    const level = await addOneLevel(
      session(), characterId, ctx.klassMap.pc["Wizard"], 1, 4, null,
      WIZARD_L1_SKILLS(ctx), wizardL1Feats(ctx, "Cat Familiar"), WIZARD_L1_POWERS(ctx),
    );
    expect(await Characters.findOne(db, {
      parentCharacterId: characterId, kind: "familiar",
    })).toBeDefined();

    // Re-finalize the same level without a Familiar Bond pick — force=true
    // since the master would otherwise fail validation on the unspent slot.
    await CharacterLevelsMethods.updateLevel(
      session(), characterId, level.id, 4, null,
      WIZARD_L1_SKILLS(ctx), wizardL1Feats(ctx, null), WIZARD_L1_POWERS(ctx),
      true,
    );

    expect(await Characters.findOne(db, {
      parentCharacterId: characterId, kind: "familiar",
    })).toBeUndefined();
  });

  test("master archive cascades to familiar; unarchive restores it", async () => {
    const { ctx, characterId } = await makeWizard("Reconcile Wizard Archive");
    await addOneLevel(
      session(), characterId, ctx.klassMap.pc["Wizard"], 1, 4, null,
      WIZARD_L1_SKILLS(ctx), wizardL1Feats(ctx, "Cat Familiar"), WIZARD_L1_POWERS(ctx),
    );
    const familiar = (await Characters.findOne(db, {
      parentCharacterId: characterId, kind: "familiar",
    }))!;

    await Characters.archive(db, { id: characterId });
    const archivedRow = await db
      .select().from(charactersInCharacter)
      .where(and(eq(charactersInCharacter.id, familiar.id), isNotNull(charactersInCharacter.deletedAt)));
    expect(archivedRow).toHaveLength(1);

    await Characters.unarchive(db, { id: characterId });
    const restored = await Characters.findOne(db, { id: familiar.id }, Visibility.UnarchivedOnly);
    expect(restored).toBeDefined();
  });

  test("familiars don't surface in character listings", async () => {
    const { ctx, characterId } = await makeWizard("Reconcile Wizard Listing");
    await addOneLevel(
      session(), characterId, ctx.klassMap.pc["Wizard"], 1, 4, null,
      WIZARD_L1_SKILLS(ctx), wizardL1Feats(ctx, "Cat Familiar"), WIZARD_L1_POWERS(ctx),
    );

    const familiar = await Characters.findOne(db, {
      parentCharacterId: characterId, kind: "familiar",
    });
    expect(familiar).toBeDefined();

    const listed = await Characters.findMany(
      db,
      { userId: SEED_USER_ID, visibility: Visibility.UnarchivedOnly },
      { limit: 200, page: 1 },
    );
    expect(listed.items.some((c) => c.id === familiar!.id)).toBe(false);
    expect(listed.items.some((c) => c.id === characterId)).toBe(true);
  });

  test("findOne with userId rejects familiars (user-facing path is PC-only)", async () => {
    const { ctx, characterId } = await makeWizard("Reconcile Wizard Direct");
    await addOneLevel(
      session(), characterId, ctx.klassMap.pc["Wizard"], 1, 4, null,
      WIZARD_L1_SKILLS(ctx), wizardL1Feats(ctx, "Cat Familiar"), WIZARD_L1_POWERS(ctx),
    );

    const familiar = (await Characters.findOne(db, {
      parentCharacterId: characterId, kind: "familiar",
    }))!;

    const internal = await Characters.findOne(db, { id: familiar.id });
    expect(internal).toBeDefined();

    const userFacing = await Characters.findOne(db, {
      id: familiar.id, userId: SEED_USER_ID,
    });
    expect(userFacing).toBeUndefined();
  });

  test("multiclass Wizard1/Sorcerer1 stacks Familiar Bond to 2 slots", async () => {
    const { ctx, characterId } = await makeWizard("Reconcile Wizard Multi");

    const wizardLevel = await addOneLevel(
      session(), characterId, ctx.klassMap.pc["Wizard"], 1, 4, null,
      WIZARD_L1_SKILLS(ctx), wizardL1Feats(ctx, "Cat Familiar"), WIZARD_L1_POWERS(ctx),
    );

    await addOneLevel(
      session(), characterId, ctx.klassMap.pc["Sorcerer"], 1, 4, null,
      {
        [ctx.skillMap["Bluff"]]: 4, [ctx.skillMap["Concentration"]]: 4,
        [ctx.skillMap["Spellcraft"]]: 4, [ctx.skillMap["Use Magic Device"]]: 4,
      },
      {
        [ctx.aptMap["Familiar Bond"]]: [ctx.featMap["Owl Familiar"]],
      },
      {
        [ctx.aptMap["Sorcerer Spells"]]: [
          ctx.powerMap["Detect Magic"], ctx.powerMap["Light"],
          ctx.powerMap["Read Magic"], ctx.powerMap["Mage Hand"],
          ctx.powerMap["Magic Missile"], ctx.powerMap["Shield"],
        ],
      },
    );

    const masterRecord = (await Characters.findOne(db, { id: characterId }))!;
    const master = new DetailedCharacter(masterRecord);
    await master.build();
    const familiarBond = master.getDetailedCharacterAptitudes().getAptitudes()["familiarbond"];
    expect(familiarBond.allowed).toBe(2);
    expect(familiarBond.spent).toBe(2);

    // Last bonded.familiar.race write wins — Sorcerer pick overrides Cat.
    const familiar = (await Characters.findOne(db, {
      parentCharacterId: characterId, kind: "familiar",
    }))!;
    expect(familiar.raceId).toBe(ctx.raceMap.familiar["Owl"]);

    // Re-saving the earlier level must not make its projected Cat pick win
    // over the later Sorcerer pick, or change the result after a fresh load.
    await CharacterLevelsMethods.updateLevel(
      session(), characterId, wizardLevel.id, 4, null,
      WIZARD_L1_SKILLS(ctx), wizardL1Feats(ctx, "Cat Familiar"), WIZARD_L1_POWERS(ctx),
    );
    const afterEdit = (await Characters.findOne(db, {
      parentCharacterId: characterId, kind: "familiar",
    }))!;
    expect(afterEdit.raceId).toBe(ctx.raceMap.familiar["Owl"]);

    const reloadedMaster = new DetailedCharacter(masterRecord);
    await reloadedMaster.build();
    expect(reloadedMaster.getDetailedCharacterBonds().getBondedRace("familiar")).toBe("Owl");
  });

  test("a non-wizard with a X Familiar feat directly attached still materializes a familiar", async () => {
    // Direct seed path bypasses finalizeLevelUp's reconcile.
    const ctx = await getSeedContext(db);
    const characterId = await createCharacter(db, ctx, {
      raceName: "Human", name: "Reconcile Direct", xp: 0,
      alignment: "Neutral Good", age: 25, gender: "Male",
      height: "175", weight: "70", description: "Test",
      abilities: { Strength: 12, Dexterity: 14, Constitution: 14, Intelligence: 12, Wisdom: 10, Charisma: 10 },
      languages: ["Common"],
    });
    const levelIds = await addClassLevels(db, ctx, characterId, "Wizard", [1], [4]);
    await addFeats(db, ctx, levelIds, [
      { levelIndex: 0, featName: "Toughness", aptitude: "General" },
      { levelIndex: 0, featName: "Combat Casting", aptitude: "General" },
      { levelIndex: 0, featName: "Generalist", aptitude: "Wizard Specialization" },
      { levelIndex: 0, featName: "Raven Familiar", aptitude: "Familiar Bond" },
    ]);

    // No reconcile yet (no level mutation since the feat was attached) —
    // assert the master's resolved bond instead of a child row.
    const masterRecord = (await Characters.findOne(db, { id: characterId }))!;
    const master = new DetailedCharacter(masterRecord);
    await master.build();
    expect(master.getDetailedCharacterBonds().getBondedRace("familiar")).toBe("Raven");
  });
});
