import { db } from "@/server/database/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import { CharactersMethods } from "@/server/services/CharactersService.ts";
import { addOneLevel } from "@/tests/helpers.ts";
import { getSeedContext, SEED_USER_ID } from "@/database/seeds/helpers.ts";
import {
  druidL1Feats,
  druidL1Skills,
  makeDruid,
  makeDruidWithAnimalCompanion,
  makeSession,
} from "@/tests/bondedFixtures.ts";
import DetailedCharacterAnimalCompanion from "@/server/rulesets/dnd3.5/DetailedCharacterAnimalCompanion.ts";
import { describe, expect, test } from "bun:test";

const session = makeSession;

describe("AnimalCompanion — reconcile materializes child character", () => {
  test("Druid L1 with Wolf Companion creates an animal companion row", async () => {
    const { masterId } = await makeDruidWithAnimalCompanion("AC Druid 1");
    const companion = await Characters.findOne(db, {
      parentCharacterId: masterId,
      kind: "animalcompanion",
    });
    expect(companion).toBeDefined();
    expect(companion!.kind).toBe("animalcompanion");
    expect(companion!.raceId).toBeDefined();
    expect(companion!.userId).toBe(SEED_USER_ID);
  });

  test("getCharacter on master exposes bondedByKind.animalcompanion", async () => {
    const { masterId } = await makeDruidWithAnimalCompanion("AC Druid Get");
    const result = await CharactersMethods.getCharacter(session(), masterId);
    expect(result.bondedByKind.animalcompanion).toBeDefined();
    expect(result.bondedByKind.animalcompanion!.record.kind).toBe("animalcompanion");
  });

  test("AC sized to druid level (Druid 3 → 3 AC class levels)", async () => {
    const ctx = await getSeedContext(db);
    const masterId = await makeDruid("AC Druid 3 Effective", ctx);
    await addOneLevel(
      session(), masterId, ctx.klassMap.pc["Druid"], 1, 8, null,
      druidL1Skills(ctx), druidL1Feats(ctx, "Wolf Animal Companion"), {},
    );
    for (let lv = 2; lv <= 3; lv++) {
      await addOneLevel(session(), masterId, ctx.klassMap.pc["Druid"], lv, 8, null, {}, {}, {}, true);
    }
    const companion = (await Characters.findOne(db, {
      parentCharacterId: masterId, kind: "animalcompanion",
    }))!;
    const levels = await import("@/server/repositories/index.ts").then((m) =>
      m.CharacterLevels.findMany(db, { characterId: companion.id }),
    );
    expect(levels).toHaveLength(3);
  });
});

describe("AnimalCompanion — RAW stat-block math at druid 3", () => {
  test("Wolf at druid 3 matches the Monster Manual: 4 HD, BAB +3, AC 17, Fort/Ref/Will +6/+7/+2, Bite +5 (1d6+2)", async () => {
    const ctx = await getSeedContext(db);
    const masterId = await makeDruid("AC Druid 3 Wolf RAW", ctx);
    await addOneLevel(
      session(), masterId, ctx.klassMap.pc["Druid"], 1, 8, null,
      druidL1Skills(ctx), druidL1Feats(ctx, "Wolf Animal Companion"), {},
    );
    for (let lv = 2; lv <= 3; lv++) {
      await addOneLevel(session(), masterId, ctx.klassMap.pc["Druid"], lv, 8, null, {}, {}, {}, true);
    }
    const companion = (await Characters.findOne(db, {
      parentCharacterId: masterId, kind: "animalcompanion",
    }))!;
    const detailed = new DetailedCharacterAnimalCompanion(companion);
    await detailed.build();

    const combat = detailed.getDetailedCharacterCombat().getCombat();
    expect(combat.hp.base).toBe(18); // 4 HD × avg 4.5
    expect(combat.bab).toBe(3); // ¾ × 4 HD
    expect(combat.ac.natural).toBe(4); // 2 base + 2 basics-table
    expect(combat.ac.size).toBe(0); // Wolf is Medium
    expect(combat.ac.total).toBe(17); // 10 + 4 natural + 3 dex + 0 size

    const saves = detailed.getDetailedCharacterSavingThrows().getSavingThrows();
    expect(saves["fortitude"].total).toBe(6); // 4 good + 2 Con
    expect(saves["reflex"].total).toBe(7);    // 4 good + 3 Dex
    expect(saves["will"].total).toBe(2);      // 1 poor + 1 Wis

    const mainAttack = combat.weaponsets["0"]?.mainhand;
    expect(mainAttack?.name).toBe("Bite");
    expect(mainAttack?.tohit?.size).toBe(0); // Medium attack mod
    expect(mainAttack?.tohit?.total?.[0]).toBe(6);     // BAB 3 + Dex 3 (Weapon Finesse)
    expect(mainAttack?.damage?.total).toBe("1d6 + 2"); // base + Str
  });
});

describe("AnimalCompanion — basics table applies natural armor & Str/Dex", () => {
  test("Druid 3 + Wolf companion applies +2 natural armor and +1 Str/Dex (effective 3 → 3-5 row)", async () => {
    const ctx = await getSeedContext(db);
    const masterId = await makeDruid("AC Druid 3 Wolf", ctx);
    await addOneLevel(
      session(), masterId, ctx.klassMap.pc["Druid"], 1, 8, null,
      druidL1Skills(ctx), druidL1Feats(ctx, "Wolf Animal Companion"), {},
    );
    for (let lv = 2; lv <= 3; lv++) {
      await addOneLevel(session(), masterId, ctx.klassMap.pc["Druid"], lv, 8, null, {}, {}, {}, true);
    }
    const companion = (await Characters.findOne(db, {
      parentCharacterId: masterId, kind: "animalcompanion",
    }))!;
    const detailed = new DetailedCharacterAnimalCompanion(companion);
    await detailed.build();

    const combat = detailed.getDetailedCharacterCombat().getCombat();
    const abilities = detailed.getDetailedCharacterAbilities().getAbilities();
    expect(combat.ac.natural).toBeGreaterThanOrEqual(2);

    const strMisc = abilities["strength"]?.misc ?? 0;
    const dexMisc = abilities["dexterity"]?.misc ?? 0;
    expect(strMisc).toBeGreaterThanOrEqual(1);
    expect(dexMisc).toBeGreaterThanOrEqual(1);
  });

  test("Druid 1 + Wolf shows Wolf's base natural armor +2 with no basics-table bump (effective 1 → 1-2 row)", async () => {
    const { masterId } = await makeDruidWithAnimalCompanion("AC Druid 1 Wolf NoBonus");
    const companion = (await Characters.findOne(db, {
      parentCharacterId: masterId, kind: "animalcompanion",
    }))!;

    const baseline = new DetailedCharacterAnimalCompanion(companion);
    await baseline.build();

    const combat = baseline.getDetailedCharacterCombat().getCombat();
    expect(combat.ac.natural).toBe(2);
    expect(combat.bab).toBe(Math.floor((2 + 0) * 3 / 4));
  });
});
