import { describe, expect, test } from "bun:test";

import { addClassLevels, addPowers, SEED_USER_ID, type SeedContext } from "@/database/seeds/helpers.ts";
import { db } from "@/server/database/index.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { postCharacter } from "@/tests/support/characters.ts";
import { FIGHTER_LEVELS, picks, type Picks } from "@/tests/support/levelFixtures.ts";
import { createSeededTestRulesetWithExtensions } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

const levels = api.api.characters.levels[":characterId"];
const level = levels[":characterLevelId"];

/** A new human character of the seeded user's (INT 12), on the seeded ruleset unless `rulesetId` says otherwise. */
async function createCharacter(rulesetId?: string) {
  const ctx = await getSeedCtx();
  const scores: Record<string, number> = {
    Strength: 16,
    Dexterity: 14,
    Constitution: 14,
    Intelligence: 12,
    Wisdom: 10,
    Charisma: 8,
  };
  const abilities = Object.fromEntries(Object.entries(scores).map(([name, score]) => [ctx.abilityMap[name], score]));
  const character = await postCharacter({ rulesetId, abilities, alignment: "Neutral Good" });
  return { characterId: character.id, ctx };
}

/** Finalizes one level, returning the raw response. */
function finalize(characterId: string, klassId: string, levelNumber: number, hp: number, levelPicks: Picks) {
  return levels.finalize.$post({
    param: { characterId },
    json: { levels: [{ klassId, level: levelNumber, hp, abilityId: null }], ...levelPicks },
  });
}

/** Finalizes one level and returns it. */
async function finalizeOk(characterId: string, klassId: string, levelNumber: number, hp: number, levelPicks: Picks) {
  const [created] = await expectOk(finalize(characterId, klassId, levelNumber, hp, levelPicks));
  return created;
}

// A human fighter (INT 12): 16 skill points, 2 General feats and a bonus feat at the first level; 4 points and a bonus feat at the second.
function fighter1(ctx: SeedContext) {
  return picks(ctx, FIGHTER_LEVELS[0]);
}
function fighter2(ctx: SeedContext) {
  return picks(ctx, FIGHTER_LEVELS[1]);
}

function featIds(feats: Record<string, { id: string }[]>, aptitudeId: string) {
  return (feats[aptitudeId] ?? []).map((f) => f.id);
}

describe("character levels", () => {
  describe("level up", () => {
    test("lists the classes a character can take, with the level each one is at", async () => {
      const { characterId, ctx } = await createCharacter();
      const nextFighterLevel = async () =>
        (await expectOk(levels["available-classes"].$get({ param: { characterId }, query: {} }))).items.find(
          (k) => k.id === ctx.klassMap.pc["Fighter"],
        );

      expect(await nextFighterLevel()).toMatchObject({ nextLevel: 1, eligible: true });
      const created = await finalizeOk(characterId, ctx.klassMap.pc["Fighter"], 1, 8, fighter1(ctx));
      expect(created).toMatchObject({ characterId, hp: 8 });
      expect(await nextFighterLevel()).toMatchObject({ nextLevel: 2 });
      await finalizeOk(characterId, ctx.klassMap.pc["Fighter"], 2, 6, fighter2(ctx));
      expect(await nextFighterLevel()).toMatchObject({ nextLevel: 3 });
    });

    test("reads the feats picked in the query, leaving out what isn't a pick", async () => {
      const { characterId, ctx } = await createCharacter();
      const general = ctx.aptMap["General"];
      const cleave = async (selectedFeatPicks?: string) =>
        (
          await expectOk(
            levels["available-feats"].$get({
              param: { characterId },
              query: {
                aptitudeId: general,
                classId: ctx.klassMap.pc["Fighter"],
                level: "1",
                search: "Cleave",
                selectedFeatPicks,
              },
            }),
          )
        ).items.find((feat) => feat.name === "Cleave");

      // Cleave needs Power Attack: picked at this level, it's eligible
      expect(await cleave()).toMatchObject({ eligible: false });
      expect(await cleave(`not:ids,${ctx.featMap["Power Attack"]}:${general}`)).toMatchObject({ eligible: true });
    });

    test("reports the slots a class level grants", async () => {
      const { characterId, ctx } = await createCharacter();
      const query = { classId: ctx.klassMap.pc["Fighter"], level: "1" };

      const skills = await expectOk(levels["skill-slots"].$get({ param: { characterId }, query }));
      expect(skills).toMatchObject({ skillPointsToSpend: 16, totalCharacterLevel: 1 });

      const feats = await expectOk(levels["feat-slots"].$get({ param: { characterId }, query }));
      expect(feats.featsToSelect).toBe(3);
      const pools = Object.values(feats.aptitudePools);
      expect(pools.find((p) => p.name === "General")?.available).toBe(2);
      expect(pools.find((p) => p.name === "Fighter Bonus Feat")?.available).toBe(1);

      const powers = await expectOk(levels["power-slots"].$get({ param: { characterId }, query }));
      expect(powers.powersToSelect).toBe(0);

      // Ability increases only come every 4 character levels.
      expect(await expectOk(levels["attribute-slots"].$get({ param: { characterId }, query: {} }))).toMatchObject({
        isAvailable: false,
      });
    });

    test("lists the feats of a pool, flat and grouped by family", async () => {
      const { characterId, ctx } = await createCharacter();
      const query = {
        aptitudeId: ctx.aptMap["General"],
        classId: ctx.klassMap.pc["Fighter"],
        level: "1",
        search: "Weapon Focus",
      };

      const flat = await expectOk(levels["available-feats"].$get({ param: { characterId }, query }));
      expect(flat.items.length).toBeGreaterThan(1);
      const grouped = await expectOk(levels["available-feats"].grouped.$get({ param: { characterId }, query }));
      expect(grouped.items.length).toBeLessThan(flat.items.length);
    });

    test("previews the pools of a planned level-up", async () => {
      const { characterId, ctx } = await createCharacter();
      const preview = await expectOk(
        levels.preview.$post({
          param: { characterId },
          json: {
            levels: [
              { klassId: ctx.klassMap.pc["Fighter"], level: 1 },
              { klassId: ctx.klassMap.pc["Fighter"], level: 2 },
            ],
            abilityIds: [null, null],
          },
        }),
      );
      // Human Fighter 1–2, INT 12: 16 + 4 skill points; 2 General feats and 2 Fighter Bonus Feats.
      expect(preview.skills).toMatchObject({ skillPointsToSpend: 20, totalCharacterLevel: 2 });
      expect(preview.perLevelSkillPoints).toEqual([16, 4]);
      const pools = Object.values(preview.feats.aptitudePools);
      expect(pools.find((p) => p.name === "General")?.available).toBe(2);
      expect(pools.find((p) => p.name === "Fighter Bonus Feat")?.available).toBe(2);
    });
  });

  describe("available powers", () => {
    test("keeps a spell another class picked, and drops one this class already picked", async () => {
      const { characterId, ctx } = await createCharacter();
      const detectMagic = async (klassLevel: string) => {
        const query = {
          aptitudeId: ctx.aptMap["Wizard Spells"],
          classId: ctx.klassMap.pc["Wizard"],
          level: klassLevel,
          powerLevel: "0",
          search: "Detect Magic",
        };
        return (await expectOk(levels["available-powers"].$get({ param: { characterId }, query }))).items.map(
          (p) => p.name,
        );
      };

      const [clericLevel] = await addClassLevels(db, ctx, characterId, "Cleric", [1], [8]);
      await addPowers(
        db,
        ctx,
        [clericLevel],
        [{ levelIndex: 0, powerName: "Detect Magic", aptitude: "Cleric Spells" }],
      );
      expect(await detectMagic("1")).toContain("Detect Magic");

      const [wizardLevel] = await addClassLevels(db, ctx, characterId, "Wizard", [1], [4]);
      await addPowers(
        db,
        ctx,
        [wizardLevel],
        [{ levelIndex: 0, powerName: "Detect Magic", aptitude: "Wizard Spells" }],
      );
      expect(await detectMagic("2")).not.toContain("Detect Magic");
    });

    test("lists each spell once when sibling extensions both carry it", async () => {
      const ctx = await getSeedCtx();
      const fork = await createSeededTestRulesetWithExtensions(SEED_USER_ID);
      expect(fork.extensionRulesetIds.length).toBeGreaterThan(0);
      const { characterId } = await createCharacter(fork.id);
      const listNames = async (aptitudeId: string, klassId: string, powerLevel?: string) => {
        const query = { aptitudeId, classId: klassId, level: "1", powerLevel, limit: "100" };
        return (await expectOk(levels["available-powers"].$get({ param: { characterId }, query }))).items.map(
          (p) => p.name,
        );
      };

      const cantrips = await listNames(ctx.aptMap["Wizard Spells"], ctx.klassMap.pc["Wizard"], "0");
      expect(cantrips.length).toBe(new Set(cantrips).size);

      // "Blackguard Spells" comes from the extensions (DMG and Complete Divine), not the
      // base. A spell only one extension's copy links to it must still show when another
      // extension's copy of that spell wins the dedup.
      const ruleset = api.api.rulesets[":id"];
      const [aptitude] = (
        await expectOk(ruleset.aptitudes.$get({ param: { id: fork.id }, query: { search: "Blackguard Spells" } }))
      ).items;
      const [klass] = (
        await expectOk(ruleset.classes.$get({ param: { id: fork.id }, query: { search: "Blackguard" } }))
      ).items;
      const blackguard = await listNames(aptitude.id, klass.id);
      expect(blackguard.length).toBeGreaterThan(0);
      expect(blackguard.length).toBe(new Set(blackguard).size);
    });
  });

  describe("reading and editing a level", () => {
    test("reads a level's HP, skills and feats", async () => {
      const { characterId, ctx } = await createCharacter();
      const created = await finalizeOk(characterId, ctx.klassMap.pc["Fighter"], 1, 7, fighter1(ctx));

      const data = await expectOk(level.$get({ param: { characterId, characterLevelId: created.id } }));
      expect(data).toMatchObject({
        characterLevelId: created.id,
        klassId: ctx.klassMap.pc["Fighter"],
        level: 1,
        hp: 7,
        abilityId: null,
      });
      expect(data.skills).toMatchObject(fighter1(ctx).skills);
      expect(featIds(data.feats, ctx.aptMap["General"]).sort()).toEqual(
        [ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]].sort(),
      );
      expect(featIds(data.feats, ctx.aptMap["Fighter Bonus Feat"])).toEqual([ctx.featMap["Improved Initiative"]]);
    });

    test("changes a level's HP, skills and feats", async () => {
      const { characterId, ctx } = await createCharacter();
      const created = await finalizeOk(characterId, ctx.klassMap.pc["Fighter"], 1, 8, fighter1(ctx));
      const param = { characterId, characterLevelId: created.id };

      await expectOk(
        level.$put({
          param,
          json: {
            hp: 5,
            abilityId: null,
            skills: {
              [ctx.skillMap["Climb"]]: 3,
              [ctx.skillMap["Intimidate"]]: 3,
              [ctx.skillMap["Jump"]]: 4,
              [ctx.skillMap["Swim"]]: 4,
              [ctx.skillMap["Handle Animal"]]: 2,
            },
            feats: {
              [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Toughness"]],
              [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Combat Reflexes"]],
            },
            powers: {},
          },
        }),
      );

      const data = await expectOk(level.$get({ param }));
      expect(data.hp).toBe(5);
      expect(data.skills).toMatchObject({ [ctx.skillMap["Climb"]]: 3, [ctx.skillMap["Swim"]]: 4 });
      expect(featIds(data.feats, ctx.aptMap["General"]).sort()).toEqual(
        [ctx.featMap["Power Attack"], ctx.featMap["Toughness"]].sort(),
      );
      expect(featIds(data.feats, ctx.aptMap["Fighter Bonus Feat"])).toEqual([ctx.featMap["Combat Reflexes"]]);
    });

    test("refuses HP above the class's hit die", async () => {
      const { characterId, ctx } = await createCharacter();
      const created = await finalizeOk(characterId, ctx.klassMap.pc["Fighter"], 1, 8, fighter1(ctx));
      const response = await level.$put({
        param: { characterId, characterLevelId: created.id },
        json: { hp: 11, abilityId: null, ...fighter1(ctx) },
      });
      await expectStatus(response, 400);
    });

    test("edits an earlier level without touching the later ones", async () => {
      const { characterId, ctx } = await createCharacter();
      const first = await finalizeOk(characterId, ctx.klassMap.pc["Fighter"], 1, 8, fighter1(ctx));
      const second = await finalizeOk(characterId, ctx.klassMap.pc["Fighter"], 2, 6, fighter2(ctx));

      const skills = { ...fighter1(ctx).skills, [ctx.skillMap["Climb"]]: 2, [ctx.skillMap["Handle Animal"]]: 2 };
      await expectOk(
        level.$put({
          param: { characterId, characterLevelId: first.id },
          json: { ...fighter1(ctx), hp: 7, abilityId: null, skills },
        }),
      );

      expect(await expectOk(level.$get({ param: { characterId, characterLevelId: first.id } }))).toMatchObject({
        hp: 7,
        skills: { [ctx.skillMap["Climb"]]: 2 },
      });
      const later = await expectOk(level.$get({ param: { characterId, characterLevelId: second.id } }));
      expect(later).toMatchObject({ hp: 6, skills: { [ctx.skillMap["Climb"]]: 1 } });
      expect(featIds(later.feats, ctx.aptMap["Fighter Bonus Feat"])).toEqual([ctx.featMap["Dodge"]]);
    });

    test("frees the edited level's own picks in its feat pools", async () => {
      const { characterId, ctx } = await createCharacter();
      const klassId = ctx.klassMap.pc["Fighter"];
      const first = await finalizeOk(characterId, klassId, 1, 8, fighter1(ctx));
      await finalizeOk(characterId, klassId, 2, 6, fighter2(ctx));

      const general = async (characterLevelId?: string) => {
        const slots = await expectOk(
          levels["feat-slots"].$get({
            param: { characterId },
            query: { classId: klassId, level: "1", characterLevelId },
          }),
        );
        return Object.values(slots.aptitudePools).find((p) => p.name === "General")!;
      };
      const editing = await general(first.id);
      expect(editing.available).toBeGreaterThan(0);
      expect(editing.spent).toBeLessThan((await general()).spent);
    });

    test("shows the Ranger's combat style pool when editing level 2, not level 1", async () => {
      const { characterId, ctx } = await createCharacter();
      const rangerId = ctx.klassMap.pc["Ranger"];
      const skill = (names: string[], ranks: number) =>
        Object.fromEntries(names.map((name) => [ctx.skillMap[name], ranks]));

      // Ranger 1: (6+1+1)×4 = 32 skill points, 2 General feats and a favored enemy.
      const first = await finalizeOk(characterId, rangerId, 1, 8, {
        skills: skill(
          ["Hide", "Move Silently", "Listen", "Spot", "Survival", "Search", "Knowledge (Nature)", "Climb"],
          4,
        ),
        feats: {
          [ctx.aptMap["General"]]: [ctx.featMap["Point Blank Shot"], ctx.featMap["Toughness"]],
          [ctx.aptMap["Favored Enemy"]]: [ctx.featMap["Favored Enemy: Humanoid (Goblinoid)"]],
        },
        powers: {},
      });
      // Ranger 2: 8 skill points and a combat style pick.
      const secondPicks: Picks = {
        skills: skill(["Hide", "Move Silently", "Listen", "Spot", "Survival", "Climb", "Swim", "Search"], 1),
        feats: { [ctx.aptMap["Ranger Combat Style (2nd)"]]: [ctx.featMap["Rapid Shot"]] },
        powers: {},
      };
      const second = await finalizeOk(characterId, rangerId, 2, 7, secondPicks);

      const combatStyle = async (levelNumber: number, characterLevelId: string) => {
        const slots = await expectOk(
          levels["feat-slots"].$get({
            param: { characterId },
            query: { classId: rangerId, level: String(levelNumber), characterLevelId },
          }),
        );
        return Object.values(slots.aptitudePools).find((p) => p.name === "Ranger Combat Style (2nd)")?.available ?? 0;
      };
      expect(await combatStyle(2, second.id)).toBeGreaterThan(0);
      expect(await combatStyle(1, first.id)).toBe(0);

      await expectOk(
        level.$put({
          param: { characterId, characterLevelId: second.id },
          json: { hp: 5, abilityId: null, ...secondPicks },
        }),
      );
      const edited = await expectOk(level.$get({ param: { characterId, characterLevelId: second.id } }));
      expect(edited.hp).toBe(5);
      expect(featIds(edited.feats, ctx.aptMap["Ranger Combat Style (2nd)"])).toEqual([ctx.featMap["Rapid Shot"]]);
    });

    test("batch-added levels report character-wide pools and survive editing the middle one", async () => {
      // Regression: edit-mode slot queries leave out only the level being edited (as
      // updateLevel does), so each pool is the character-wide total minus what the
      // other levels hold.
      const { characterId, ctx } = await createCharacter();
      const klassId = ctx.klassMap.pc["Fighter"];
      // General: 2 at level 1 (1 + Human), 1 at level 3. Fighter Bonus Feat: 1 at levels 1 and 2.
      const created = await expectOk(
        levels.finalize.$post({
          param: { characterId },
          json: {
            levels: [
              { klassId, level: 1, hp: 8, abilityId: null },
              { klassId, level: 2, hp: 6, abilityId: null },
              { klassId, level: 3, hp: 6, abilityId: null },
            ],
            skills: {
              [ctx.skillMap["Climb"]]: 6,
              [ctx.skillMap["Jump"]]: 6,
              [ctx.skillMap["Swim"]]: 6,
              [ctx.skillMap["Intimidate"]]: 6,
            },
            feats: {
              [ctx.aptMap["General"]]: [ctx.featMap["Power Attack"], ctx.featMap["Cleave"], ctx.featMap["Toughness"]],
              [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Improved Initiative"], ctx.featMap["Dodge"]],
            },
            powers: {},
          },
        }),
      );
      expect(created).toHaveLength(3);
      const [l1, l2, l3] = created;

      const pools = async (levelNumber: number, characterLevelId: string) => {
        const slots = await expectOk(
          levels["feat-slots"].$get({
            param: { characterId },
            query: { classId: klassId, level: String(levelNumber), characterLevelId },
          }),
        );
        const pool = (name: string) => Object.values(slots.aptitudePools).find((p) => p.name === name);
        return { general: pool("General"), bonus: pool("Fighter Bonus Feat") };
      };
      // Level 1 holds Power Attack, Cleave and Improved Initiative; level 2 Dodge; level 3 Toughness.
      expect(await pools(1, l1.id)).toMatchObject({
        general: { allowed: 3, available: 2 },
        bonus: { allowed: 2, available: 1 },
      });
      expect(await pools(2, l2.id)).toMatchObject({
        general: { allowed: 3, available: 0 },
        bonus: { allowed: 2, available: 1 },
      });
      expect(await pools(3, l3.id)).toMatchObject({
        general: { allowed: 3, available: 1 },
        bonus: { allowed: 2, available: 0 },
      });

      await expectOk(
        level.$put({
          param: { characterId, characterLevelId: l2.id },
          json: {
            hp: 4,
            abilityId: null,
            skills: {
              [ctx.skillMap["Listen"]]: 1,
              [ctx.skillMap["Spot"]]: 1,
              [ctx.skillMap["Climb"]]: 1,
              [ctx.skillMap["Swim"]]: 1,
            },
            feats: { [ctx.aptMap["Fighter Bonus Feat"]]: [ctx.featMap["Combat Reflexes"]] },
            powers: {},
          },
        }),
      );
      const read = (characterLevelId: string) => expectOk(level.$get({ param: { characterId, characterLevelId } }));
      const [after1, after2, after3] = [await read(l1.id), await read(l2.id), await read(l3.id)];
      expect(after2.hp).toBe(4);
      expect(featIds(after2.feats, ctx.aptMap["Fighter Bonus Feat"])).toEqual([ctx.featMap["Combat Reflexes"]]);
      expect(after1.hp).toBe(8);
      expect(featIds(after1.feats, ctx.aptMap["Fighter Bonus Feat"])).toContain(ctx.featMap["Improved Initiative"]);
      expect(after3.hp).toBe(6);
      expect(featIds(after3.feats, ctx.aptMap["General"])).toContain(ctx.featMap["Toughness"]);
    });
  });

  describe("removing a level", () => {
    test("removes the last level", async () => {
      const { characterId, ctx } = await createCharacter();
      await finalizeOk(characterId, ctx.klassMap.pc["Fighter"], 1, 8, fighter1(ctx));
      await finalizeOk(characterId, ctx.klassMap.pc["Fighter"], 2, 6, fighter2(ctx));

      expect(await expectOk(levels.$delete({ param: { characterId } }))).toMatchObject({ success: true });
      const classes = await expectOk(levels["available-classes"].$get({ param: { characterId }, query: {} }));
      expect(classes.items.find((k) => k.id === ctx.klassMap.pc["Fighter"])).toMatchObject({ nextLevel: 2 });
    });

    test("returns 404 for a character without levels", async () => {
      const { characterId } = await createCharacter();
      await expectStatus(levels.$delete({ param: { characterId } }), 404);
    });
  });

  test("requires a session", async () => {
    const { characterId, ctx } = await createCharacter();
    const guest = guestApi.api.characters.levels[":characterId"];
    const query = { classId: ctx.klassMap.pc["Fighter"], level: "1" };
    const responses = await Promise.all([
      guest["available-classes"].$get({ param: { characterId }, query: {} }),
      guest["attribute-slots"].$get({ param: { characterId }, query: {} }),
      guest["skill-slots"].$get({ param: { characterId }, query }),
      guest["feat-slots"].$get({ param: { characterId }, query }),
      guest["power-slots"].$get({ param: { characterId }, query }),
      guest.finalize.$post({
        param: { characterId },
        json: {
          levels: [{ klassId: query.classId, level: 1, hp: 8, abilityId: null }],
          skills: {},
          feats: {},
          powers: {},
        },
      }),
      guest[":characterLevelId"].$get({ param: { characterId, characterLevelId: NIL_UUID } }),
      guest[":characterLevelId"].$put({
        param: { characterId, characterLevelId: NIL_UUID },
        json: { hp: 5, abilityId: null, skills: {}, feats: {}, powers: {} },
      }),
      guest.$delete({ param: { characterId } }),
    ]);
    for (const response of responses) await expectStatus(response, 401);
  });

  test("returns 404 for a missing character, class level or character level", async () => {
    const { characterId, ctx } = await createCharacter();
    const klassId = ctx.klassMap.pc["Fighter"];
    const missing = { characterId: NIL_UUID };
    const query = { classId: klassId, level: "1" };
    const noPicks = { skills: {}, feats: {}, powers: {} };

    await expectStatus(levels["available-classes"].$get({ param: missing, query: {} }), 404);
    await expectStatus(levels["attribute-slots"].$get({ param: missing, query: {} }), 404);
    await expectStatus(levels["skill-slots"].$get({ param: missing, query }), 404);
    await expectStatus(levels["feat-slots"].$get({ param: missing, query }), 404);
    await expectStatus(levels["power-slots"].$get({ param: missing, query }), 404);
    await expectStatus(finalize(NIL_UUID, klassId, 1, 8, noPicks), 404);
    await expectStatus(levels.$delete({ param: missing }), 404);
    await expectStatus(finalize(characterId, klassId, 999, 8, noPicks), 404);
    const characterLevel = { characterId, characterLevelId: NIL_UUID };
    await expectStatus(level.$get({ param: characterLevel }), 404);
    await expectStatus(level.$put({ param: characterLevel, json: { hp: 5, abilityId: null, ...noPicks } }), 404);
  });
});
