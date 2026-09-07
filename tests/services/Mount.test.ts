import { db } from "@/server/database/index.ts";
import { Characters } from "@/server/repositories/index.ts";
import { CharactersMethods } from "@/server/services/CharactersService.ts";
import { addOneLevel } from "@/tests/helpers.ts";
import { getSeedContext, SEED_USER_ID } from "@/database/seeds/helpers.ts";
import {
  makePaladin,
  makePaladinWithMount,
  makeSession,
  paladinL1Feats,
  paladinL1Skills,
} from "@/tests/bondedFixtures.ts";
import DetailedCharacterMount from "@/server/rulesets/dnd3.5/DetailedCharacterMount.ts";
import { describe, expect, test } from "bun:test";

const session = makeSession;

describe("Mount — reconcile materializes child character", () => {
  test("Paladin L5 with Heavy Warhorse Mount creates a mount row", async () => {
    const { masterId } = await makePaladinWithMount("Mount Paladin 5");
    const mount = await Characters.findOne(db, {
      parentCharacterId: masterId,
      kind: "mount",
    });
    expect(mount).toBeDefined();
    expect(mount!.kind).toBe("mount");
    expect(mount!.userId).toBe(SEED_USER_ID);
  });

  test("getCharacter on master exposes bondedByKind.mount", async () => {
    const { masterId } = await makePaladinWithMount("Mount Paladin Get");
    const result = await CharactersMethods.getCharacter(session(), masterId);
    expect(result.bondedByKind.mount).toBeDefined();
    expect(result.bondedByKind.mount!.record.kind).toBe("mount");
  });

  test("Mount sized to paladin level (paladin 5 → 5 mount class levels)", async () => {
    const { mountId } = await makePaladinWithMount("Mount Levels");
    const levels = await import("@/server/repositories/index.ts").then((m) =>
      m.CharacterLevels.findMany(db, { characterId: mountId }),
    );
    expect(levels).toHaveLength(5);
  });
});

describe("Mount — SRD Special Mount math at paladin 5", () => {
  test("Heavy Warhorse at paladin 5 hits the SRD 5-7 bracket: bonus HD +2, NA +4, Str +1, Int 6", async () => {
    const { masterId } = await makePaladinWithMount("Mount Paladin 5 RAW");
    const mount = (await Characters.findOne(db, {
      parentCharacterId: masterId, kind: "mount",
    }))!;
    const detailed = new DetailedCharacterMount(mount);
    await detailed.build();

    // Heavy Warhorse: baseHD 4 + bonusHD 2 = 6 HD total
    const combat = detailed.getDetailedCharacterCombat().getCombat();
    expect(combat.bab).toBe(Math.floor((6 * 3) / 4)); // ¾ BAB at 6 HD = 4
    expect(combat.ac.natural).toBe(4 + 4);            // race 4 + bracket 4
    expect(combat.ac.size).toBe(-1);                  // Heavy Warhorse is Large
    expect(combat.ac.total).toBe(10 + 8 - 1 + 1);     // 10 + 8 nat + -1 size + 1 dex = 18

    // Saves keyed on total HD: Fort/Ref good (2 + 6/2 = 5), Will poor (6/3 = 2)
    const saves = detailed.getDetailedCharacterSavingThrows().getSavingThrows();
    expect(saves["fortitude"].base).toBe(5);
    expect(saves["reflex"].base).toBe(5);
    expect(saves["will"].base).toBe(2);

    // Int gets set absolutely to bracket value, not delta
    const abilities = detailed.getDetailedCharacterAbilities().getAbilities();
    expect(abilities["intelligence"].total).toBe(6);

    // Str gets +1 misc bump from bracket on top of race score 18
    expect(abilities["strength"].total).toBe(18 + 1);
  });
});

describe("Mount — Share Saving Throws (paladin 5+)", () => {
  test("at paladin 10 the mount Fort uses max(master, mount) per SRD", async () => {
    const ctx = await getSeedContext(db);
    const masterId = await makePaladin("Mount Share Saves", ctx);
    await addOneLevel(
      session(), masterId, ctx.klassMap.pc["Paladin"], 1, 10, null,
      paladinL1Skills(ctx), paladinL1Feats(ctx), {},
    );
    for (let lv = 2; lv <= 10; lv++) {
      const abilityId = lv % 4 === 0 ? ctx.abilityMap["Strength"] : null;
      if (lv === 5) {
        await addOneLevel(
          session(), masterId, ctx.klassMap.pc["Paladin"], 5, 10, abilityId,
          {}, { [ctx.aptMap["Special Mount Bond"]]: [ctx.featMap["Heavy Warhorse Special Mount"]] }, {},
          true,
        );
      } else {
        await addOneLevel(session(), masterId, ctx.klassMap.pc["Paladin"], lv, 10, abilityId, {}, {}, {}, true);
      }
    }

    const mount = (await Characters.findOne(db, {
      parentCharacterId: masterId, kind: "mount",
    }))!;
    const detailed = new DetailedCharacterMount(mount);
    await detailed.build();

    // Heavy Warhorse: race HD 4 + bracket 8-10 bonus HD +4 = 8 total HD.
    // Mount's own good-save base at 8 HD = 2 + 4 = 6.
    // Paladin 10 good-save base = 7.
    // Share Saving Throws: mount uses max → 7.
    const saves = detailed.getDetailedCharacterSavingThrows().getSavingThrows();
    expect(saves["fortitude"].base).toBe(7);
  });
});

describe("Mount — bracket transitions on paladin level-up", () => {
  test("Paladin 8 hits the 8-10 bracket: bonus HD +4, NA +6, Str +2, Int 7", async () => {
    const ctx = await getSeedContext(db);
    const masterId = await makePaladin("Mount Paladin 8", ctx);
    await addOneLevel(
      session(), masterId, ctx.klassMap.pc["Paladin"], 1, 10, null,
      paladinL1Skills(ctx), paladinL1Feats(ctx), {},
    );
    for (let lv = 2; lv <= 4; lv++) {
      const abilityId = lv === 4 ? ctx.abilityMap["Strength"] : null;
      await addOneLevel(session(), masterId, ctx.klassMap.pc["Paladin"], lv, 10, abilityId, {}, {}, {}, true);
    }
    await addOneLevel(
      session(), masterId, ctx.klassMap.pc["Paladin"], 5, 10, null,
      {}, { [ctx.aptMap["Special Mount Bond"]]: [ctx.featMap["Heavy Warhorse Special Mount"]] }, {},
      true,
    );
    for (let lv = 6; lv <= 8; lv++) {
      const abilityId = lv === 8 ? ctx.abilityMap["Strength"] : null;
      await addOneLevel(session(), masterId, ctx.klassMap.pc["Paladin"], lv, 10, abilityId, {}, {}, {}, true);
    }
    const mount = (await Characters.findOne(db, {
      parentCharacterId: masterId, kind: "mount",
    }))!;
    const detailed = new DetailedCharacterMount(mount);
    await detailed.build();

    const combat = detailed.getDetailedCharacterCombat().getCombat();
    expect(combat.ac.natural).toBe(4 + 6); // race 4 + bracket 6 at paladin 8

    const abilities = detailed.getDetailedCharacterAbilities().getAbilities();
    expect(abilities["intelligence"].total).toBe(7);
    expect(abilities["strength"].total).toBe(18 + 2);
  });
});
