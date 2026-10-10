import { describe, expect, test } from "bun:test";

import type { InferResponseType } from "hono/client";

import { addClassLevels, addPowers } from "@/scripts/db/seeds/seedCharacter.ts";
import { type SeedContext } from "@/scripts/db/seeds/seedContext.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { db } from "@/server/database/index.ts";
import { api, expectOk, expectStatus, guestApi } from "@/tests/support/api.ts";
import { postCharacter } from "@/tests/support/characters.ts";
import { FIGHTER_LEVELS, picks, type Picks } from "@/tests/support/dnd3.5/levelFixtures.ts";
import { findKlassLevel } from "@/tests/support/levels.ts";
import { createSeededTestRulesetWithExtensions } from "@/tests/support/rulesets.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";

/** A level-up step, as the API answers it: any of those the ruleset lists, named for which it is. */
type LevelStep = InferResponseType<(typeof step)["$get"], 200>;

/** The query a step takes: the level it's for. */
type StepQuery = Parameters<(typeof step)["$get"]>[0]["query"];

const levels = api.api.characters.levels[":characterId"];
const level = levels[":characterLevelId"];
const step = levels["level-steps"][":step"];

function featIds(feats: Record<string, { id: string }[]>, aptitudeId: string) {
  return (feats[aptitudeId] ?? []).map((f) => f.id);
}

/**
 * A human fighter (INT 12): 16 skill points, 2 General feats and a bonus feat at the first level; 4 points and a bonus
 * feat at the second.
 */
function fighter1(ctx: SeedContext) {
  return picks(ctx, FIGHTER_LEVELS[0]);
}

function fighter2(ctx: SeedContext) {
  return picks(ctx, FIGHTER_LEVELS[1]);
}

/** Finalizes one level, returning the raw response. */
function finalize(characterId: string, klassId: string, levelNumber: number, hp: number, levelPicks: Picks) {
  return levels.finalize.$post({
    param: { characterId },
    json: { levels: [{ klassId, level: levelNumber, hp, abilityIncreases: [] }], ...levelPicks },
  });
}

/** Whether the API's step is the one asked for, by its name. */
function isStep<N extends LevelStep["name"]>(
  answered: LevelStep,
  name: N,
): answered is Extract<LevelStep, { name: N }> {
  return answered.name === name;
}

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

/** Finalizes one level and returns it. */
async function finalizeOk(characterId: string, klassId: string, levelNumber: number, hp: number, levelPicks: Picks) {
  const [created] = await expectOk(finalize(characterId, klassId, levelNumber, hp, levelPicks));
  return created;
}

/** The step `name` of the level `query` is for, as the API answers it: that step. */
async function getStep<N extends LevelStep["name"]>(characterId: string, name: N, query: StepQuery) {
  const answered = await expectOk(step.$get({ param: { characterId, step: name }, query }));
  if (!isStep(answered, name)) throw new Error(`The API answered the ${answered.name} step for ${name}`);
  return answered;
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
      const cleave = async (featPicks?: string) =>
        (
          await expectOk(
            levels["available-feats"].$get({
              param: { characterId },
              query: {
                aptitudeId: general,
                classId: ctx.klassMap.pc["Fighter"],
                level: "1",
                search: "Cleave",
                featPicks,
              },
            }),
          )
        ).items.find((feat) => feat.name === "Cleave");

      // Cleave needs Power Attack: picked at this level, it's eligible
      expect(await cleave()).toMatchObject({ eligible: false });
      expect(await cleave(`not:ids,${ctx.featMap["Power Attack"]}:${general}`)).toMatchObject({ eligible: true });
    });

    test("lists the steps the ruleset gives a level, in order, and refuses one it doesn't", async () => {
      const { characterId, ctx } = await createCharacter();
      expect(await expectOk(levels["level-steps"].$get({ param: { characterId }, query: {} }))).toEqual([
        { name: "abilities", label: "Ability Increase" },
        { name: "skills", label: "Select Skills" },
        { name: "feats", label: "Select Feats" },
        { name: "powers", label: "Select Spells" },
      ]);

      const query = { classId: ctx.klassMap.pc["Fighter"], level: "1" };
      await expectStatus(step.$get({ param: { characterId, step: "languages" }, query }), 404);
      // A step that reads the level's class needs it
      await expectStatus(step.$get({ param: { characterId, step: "feats" }, query: {} }), 400);
    });

    test("reports the slots a class level grants", async () => {
      const { characterId, ctx } = await createCharacter();
      const query = { classId: ctx.klassMap.pc["Fighter"], level: "1" };

      const skills = await getStep(characterId, "skills", query);
      expect(skills).toMatchObject({ skillPointsToSpend: 16, totalCharacterLevel: 1 });

      const feats = await getStep(characterId, "feats", query);
      expect(feats.featsToSelect).toBe(3);
      const pools = Object.values(feats.aptitudePools);
      expect(pools.find((p) => p.name === "General")?.available).toBe(2);
      expect(pools.find((p) => p.name === "Fighter Bonus Feat")?.available).toBe(1);

      const powers = await getStep(characterId, "powers", query);
      expect(powers.powersToSelect).toBe(0);

      // Ability increases only come every 4 character levels.
      expect(await getStep(characterId, "abilities", {})).toMatchObject({ isAvailable: false });
    });

    test("counts the levels planned before a step's level in the character's total, which caps a rank", async () => {
      const { characterId, ctx } = await createCharacter();
      const fighter = ctx.klassMap.pc["Fighter"];
      const planned = [(await findKlassLevel(fighter, 1))!.id, (await findKlassLevel(fighter, 2))!.id];
      const skills = await getStep(characterId, "skills", {
        classId: fighter,
        level: "3",
        plannedClassLevelIds: planned.join(","),
      });
      expect(skills.totalCharacterLevel).toBe(3);
    });

    test("reads the planned levels' ability increases, leaving out what isn't one", async () => {
      const { characterId, ctx } = await createCharacter();
      const fighter = ctx.klassMap.pc["Fighter"];
      // One at a time: the test's transaction has a single connection
      const planned: string[] = [];
      for (const level of [1, 2, 3]) planned.push((await findKlassLevel(fighter, level))!.id);
      const [strength, dexterity] = [ctx.abilityMap["Strength"], ctx.abilityMap["Dexterity"]];
      // The fourth level's step: the first three planned, each level's increases "abilityId:amount" pairs joined by ";"
      const abilities = await getStep(characterId, "abilities", {
        plannedClassLevelIds: planned.join(","),
        plannedAbilityIncreases: `${strength}:1,${strength}:2;${dexterity}:1,not-an-increase`,
      });
      expect(abilities).toMatchObject({
        isAvailable: true,
        attributes: { strength: { level: 3 }, dexterity: { level: 1 }, constitution: { level: 0 } },
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

    test("leaves out of a pool's feats one a level planned after the picker's grants, dropping what isn't an id", async () => {
      const { characterId, ctx } = await createCharacter();
      // A fighter's first level, then a ranger's, which grants Track
      const ranger = (await findKlassLevel(ctx.klassMap.pc["Ranger"], 1))!.id;
      const track = async (laterClassLevelIds?: string) => {
        const query = {
          aptitudeId: ctx.aptMap["General"],
          classId: ctx.klassMap.pc["Fighter"],
          laterClassLevelIds,
          level: "1",
          search: "Track",
        };
        const flat = await expectOk(levels["available-feats"].$get({ param: { characterId }, query }));
        const grouped = await expectOk(levels["available-feats"].grouped.$get({ param: { characterId }, query }));
        return [...flat.items.map((f) => f.name), ...grouped.items.map((r) => r.displayName)];
      };

      expect(await track("not-an-id")).toEqual(["Track", "Track"]);
      expect(await track(`${ranger},not-an-id`)).toEqual([]);
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

    test("leaves out the spells the wizard picked already, as the feat picker leaves out a feat held", async () => {
      const { characterId, ctx } = await createCharacter();
      const cantrips = async (selectedPowerIds?: string) => {
        const query = {
          aptitudeId: ctx.aptMap["Wizard Spells"],
          classId: ctx.klassMap.pc["Wizard"],
          level: "1",
          powerLevel: "0",
          limit: "100",
          selectedPowerIds,
        };
        return (await expectOk(levels["available-powers"].$get({ param: { characterId }, query }))).items;
      };

      const offered = await cantrips();
      const [picked, other] = offered;
      const left = await cantrips(picked.id);
      expect(left.map((power) => power.id)).not.toContain(picked.id);
      expect(left.map((power) => power.id)).toContain(other.id);
      expect(left).toHaveLength(offered.length - 1);
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
        abilityIncreases: [],
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
            abilityIncreases: [],
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
        json: { hp: 11, abilityIncreases: [], ...fighter1(ctx) },
      });
      await expectStatus(response, 400);
    });

    test("refuses a feat its pool has no room for, forced or not", async () => {
      const { characterId, ctx } = await createCharacter();
      const levelPicks = fighter1(ctx);
      const general = ctx.aptMap["General"];
      const feats = { ...levelPicks.feats, [general]: [...levelPicks.feats[general], ctx.featMap["Toughness"]] };
      const response = await levels.finalize.$post({
        param: { characterId },
        json: {
          levels: [{ klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 8, abilityIncreases: [] }],
          ...levelPicks,
          feats,
          force: true,
        },
      });
      await expectStatus(response, 400);
    });

    test("saves a stacking feat a level picks twice, forced or not, and an edit that picks it twice", async () => {
      const { characterId, ctx } = await createCharacter();
      const levelPicks = fighter1(ctx);
      const general = ctx.aptMap["General"];
      const toughness = ctx.featMap["Toughness"];
      const feats = { ...levelPicks.feats, [general]: [toughness, toughness] };
      for (const force of [false, true]) {
        const { characterId: id } = await createCharacter();
        const [created] = await expectOk(
          levels.finalize.$post({
            param: { characterId: id },
            json: {
              levels: [{ klassId: ctx.klassMap.pc["Fighter"], level: 1, hp: 8, abilityIncreases: [] }],
              ...levelPicks,
              feats,
              force,
            },
          }),
        );
        const saved = await expectOk(level.$get({ param: { characterId: id, characterLevelId: created.id } }));
        expect(featIds(saved.feats, general)).toEqual([toughness, toughness]);
      }
      const created = await finalizeOk(characterId, ctx.klassMap.pc["Fighter"], 1, 8, levelPicks);
      const param = { characterId, characterLevelId: created.id };
      await expectOk(level.$put({ param, json: { hp: 8, abilityIncreases: [], ...levelPicks, feats } }));
      expect(featIds((await expectOk(level.$get({ param }))).feats, general)).toEqual([toughness, toughness]);
    });

    test("refuses a feat that doesn't stack a level picks twice", async () => {
      const { characterId, ctx } = await createCharacter();
      const levelPicks = fighter1(ctx);
      const powerAttack = ctx.featMap["Power Attack"];
      const feats = { ...levelPicks.feats, [ctx.aptMap["General"]]: [powerAttack, powerAttack] };
      await expectStatus(finalize(characterId, ctx.klassMap.pc["Fighter"], 1, 8, { ...levelPicks, feats }), 400);
    });

    test("refuses a class level beyond the rules' last", async () => {
      const { characterId, ctx } = await createCharacter();
      await expectStatus(finalize(characterId, ctx.klassMap.pc["Fighter"], 21, 8, fighter1(ctx)), 400);
    });

    test("edits an earlier level without touching the later ones", async () => {
      const { characterId, ctx } = await createCharacter();
      const first = await finalizeOk(characterId, ctx.klassMap.pc["Fighter"], 1, 8, fighter1(ctx));
      const second = await finalizeOk(characterId, ctx.klassMap.pc["Fighter"], 2, 6, fighter2(ctx));

      const skills = { ...fighter1(ctx).skills, [ctx.skillMap["Climb"]]: 2, [ctx.skillMap["Handle Animal"]]: 2 };
      await expectOk(
        level.$put({
          param: { characterId, characterLevelId: first.id },
          json: { ...fighter1(ctx), hp: 7, abilityIncreases: [], skills },
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
        const slots = await getStep(characterId, "feats", {
          classId: klassId,
          level: "1",
          editedLevelId: characterLevelId,
        });
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
        const slots = await getStep(characterId, "feats", {
          classId: rangerId,
          level: String(levelNumber),
          editedLevelId: characterLevelId,
        });
        return Object.values(slots.aptitudePools).find((p) => p.name === "Ranger Combat Style (2nd)")?.available ?? 0;
      };
      expect(await combatStyle(2, second.id)).toBeGreaterThan(0);
      expect(await combatStyle(1, first.id)).toBe(0);

      await expectOk(
        level.$put({
          param: { characterId, characterLevelId: second.id },
          json: { hp: 5, abilityIncreases: [], ...secondPicks },
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
              { klassId, level: 1, hp: 8, abilityIncreases: [] },
              { klassId, level: 2, hp: 6, abilityIncreases: [] },
              { klassId, level: 3, hp: 6, abilityIncreases: [] },
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
        const slots = await getStep(characterId, "feats", {
          classId: klassId,
          level: String(levelNumber),
          editedLevelId: characterLevelId,
        });
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
            abilityIncreases: [],
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
      guest["level-steps"].$get({ param: { characterId }, query: {} }),
      guest["level-steps"][":step"].$get({ param: { characterId, step: "feats" }, query }),
      guest.finalize.$post({
        param: { characterId },
        json: {
          levels: [{ klassId: query.classId, level: 1, hp: 8, abilityIncreases: [] }],
          skills: {},
          feats: {},
          powers: {},
        },
      }),
      guest[":characterLevelId"].$get({ param: { characterId, characterLevelId: NIL_UUID } }),
      guest[":characterLevelId"].$put({
        param: { characterId, characterLevelId: NIL_UUID },
        json: { hp: 5, abilityIncreases: [], skills: {}, feats: {}, powers: {} },
      }),
      guest.$delete({ param: { characterId } }),
    ]);
    for (const response of responses) await expectStatus(response, 401);
  });

  test("returns 404 for a missing character or character level", async () => {
    const { characterId, ctx } = await createCharacter();
    const klassId = ctx.klassMap.pc["Fighter"];
    const missing = { characterId: NIL_UUID };
    const query = { classId: klassId, level: "1" };
    const noPicks = { skills: {}, feats: {}, powers: {} };

    await expectStatus(levels["available-classes"].$get({ param: missing, query: {} }), 404);
    await expectStatus(levels["level-steps"].$get({ param: missing, query: {} }), 404);
    await expectStatus(step.$get({ param: { ...missing, step: "feats" }, query }), 404);
    await expectStatus(finalize(NIL_UUID, klassId, 1, 8, noPicks), 404);
    await expectStatus(levels.$delete({ param: missing }), 404);
    const characterLevel = { characterId, characterLevelId: NIL_UUID };
    await expectStatus(level.$get({ param: characterLevel }), 404);
    await expectStatus(level.$put({ param: characterLevel, json: { hp: 5, abilityIncreases: [], ...noPicks } }), 404);
  });
});
