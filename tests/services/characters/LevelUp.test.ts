import { describe, expect, test } from "bun:test";

import { type SeedContext } from "@/database/seeds/seedContext.ts";
import { levelAbilityIncreasesInCharacter } from "@/drizzle/schema.ts";
import type { AbilityIncrease } from "@/engine/index.ts";
import { db } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import {
  CharacterLevelAbilityIncreases,
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevelSkills,
} from "@/server/repositories/index.ts";
import { CharacterLevelsService } from "@/server/services/characters/levels/index.ts";
import {
  addFighterLevels,
  type BUILDS,
  createSeedCharacter,
  FIGHTER_LEVELS,
  type LevelPlan,
  levelUp,
  picks,
  WIZARD_1,
} from "@/tests/support/levelFixtures.ts";
import { increasesOf } from "@/tests/support/levels.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

/** A level of a batch: class, level, hit points and the ability it increases. */
type BatchLevel = [klass: string, level: number, hp: number, ability?: string];

const session = makeSession();

function fighter(count: number) {
  return Array.from({ length: count }, (_, i): [string, number] => ["Fighter", i + 1]);
}

/** Fighter levels 1 to `count`, as a batch. */
function fighterLevels(count: number): BatchLevel[] {
  return FIGHTER_LEVELS.slice(0, count).map((plan, index) => ["Fighter", index + 1, plan.hp, plan.ability]);
}

/** Finalizes several levels at once, the picks pooled across them. */
function finalizeBatch(
  ctx: SeedContext,
  characterId: string,
  levels: BatchLevel[],
  plan: Omit<LevelPlan, "hp">,
  force = false,
) {
  const { skills, feats, powers } = picks(ctx, plan);
  const batch = levels.map(([klass, level, hp, ability]) => ({
    klassId: ctx.klassMap.pc[klass],
    level,
    hp,
    abilityIncreases: increasesOf(ability && ctx.abilityMap[ability]),
  }));
  return CharacterLevelsService.finalizeLevelUp(session, characterId, batch, skills, feats, powers, force);
}

function levelsOf(klass: string, hps: number[]): BatchLevel[] {
  return hps.map((hp, index) => [klass, index + 1, hp]);
}

/**
 * Whether a feat is eligible at `level` of a batch of fighter levels, as Add Level's picker asks: after the levels
 * planned before it, with these picks and ability increases (one per level, the picked level's last).
 */
async function eligible(
  search: string,
  level: number,
  options: { increases?: (string | undefined)[]; pendingPicks?: string[]; strength?: number } = {},
) {
  const ctx = await getSeedCtx();
  const characterId = await createSeedCharacter(ctx, "fighter", {
    xp: 6000,
    abilities: { Strength: options.strength ?? 14 },
  });
  const plan = Array.from({ length: level }, (_, i) => ({
    abilityIncreases: [],
    klassId: ctx.klassMap.pc["Fighter"],
    level: i + 1,
  }));
  const { levelDetails } = await CharacterLevelsService.getPreview(session, characterId, plan, {}, {}, {});
  const featPicks = (options.pendingPicks ?? []).map((name) => ({
    featId: ctx.featMap[name],
    aptitudeId: ctx.aptMap["General"],
  }));
  const { items } = await CharacterLevelsService.getAvailableFeatGroups(
    session,
    characterId,
    {
      aptitudeId: ctx.aptMap["General"],
      classId: ctx.klassMap.pc["Fighter"],
      level: level,
      plannedClassLevelIds: levelDetails.slice(0, level - 1).map((d) => d.klassLevelId),
      plannedAbilityIncreases: options.increases?.slice(0, level - 1).map(increasesOf),
      abilityIncreases: increasesOf(options.increases?.[level - 1]),
      search,
      featPicks,
    },
    { limit: 20, page: 1 },
  );
  return items.find((row) => row.displayName === search)!.eligible;
}

async function preview(
  ctx: SeedContext,
  characterId: string,
  levels: [string, number][],
  abilities: (string | null)[] = levels.map(() => null),
  plan: Omit<LevelPlan, "ability" | "hp"> = {},
) {
  const { feats, powers, skills } = picks(ctx, plan);
  return CharacterLevelsService.getPreview(
    session,
    characterId,
    levels.map(([klass, level], i) => ({
      abilityIncreases: increasesOf(abilities[i]),
      klassId: ctx.klassMap.pc[klass],
      level,
    })),
    skills,
    feats,
    powers,
  );
}

/** A fighter's first two levels, and the plan the first was saved with. */
async function setupFighter() {
  const ctx = await getSeedCtx();
  const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000 });
  const first = await levelUp(session, ctx, characterId, "Fighter", 1, FIGHTER_LEVELS[0]);
  await levelUp(session, ctx, characterId, "Fighter", 2, FIGHTER_LEVELS[1]);
  const resave = (plan: Partial<LevelPlan> & { abilityId?: string | null }, force = false) => {
    const { skills, feats, powers } = picks(ctx, { ...FIGHTER_LEVELS[0], ...plan });
    return CharacterLevelsService.updateLevel(
      session,
      characterId,
      first.id,
      10,
      increasesOf(plan.abilityId),
      skills,
      feats,
      powers,
      force,
    );
  };
  return { ctx, characterId, first, resave };
}

describe("finalizing several levels at once", () => {
  const WIZARD_FEATS = {
    "Wizard Specialization": ["Evocation Specialist"],
    "Prohibited School": ["Prohibit Illusion", "Prohibit Necromancy"],
    "Familiar Bond": ["Cat Familiar"],
  };
  const WIZARD_SPELLS = {
    "Wizard Spells": [
      "Detect Magic",
      "Read Magic",
      "Mage Hand",
      "Light",
      "Ray of Frost",
      "Resistance",
      "Magic Missile",
      "Shield",
      "Mage Armor",
    ],
  };
  const CASES: {
    build: keyof typeof BUILDS;
    levels: BatchLevel[];
    name: string;
    plan: Omit<LevelPlan, "hp">;
    values?: Parameters<typeof createSeedCharacter>[2];
  }[] = [
    {
      name: "a fighter's first four levels, with an ability increase at the fourth",
      build: "fighter",
      values: { xp: 6000 },
      levels: fighterLevels(4),
      plan: {
        skills: { Climb: 7, Intimidate: 7, Jump: 7, Swim: 7 },
        feats: {
          General: ["Power Attack", "Great Fortitude", "Toughness"],
          "Fighter Bonus Feat": ["Improved Initiative", "Dodge", "Combat Reflexes"],
        },
      },
    },
    {
      // Five cantrips and two first-level spells.
      name: "a sorcerer's first two levels, with their spells",
      build: "sorcerer",
      values: { xp: 1000 },
      levels: levelsOf("Sorcerer", [4, 4]),
      plan: {
        skills: { Bluff: 5, Concentration: 5, Spellcraft: 5, "Use Magic Device": 5 },
        feats: { General: ["Toughness", "Great Fortitude"], "Familiar Bond": ["Cat Familiar"] },
        powers: {
          "Sorcerer Spells": [
            "Detect Magic",
            "Light",
            "Read Magic",
            "Mage Hand",
            "Resistance",
            "Magic Missile",
            "Shield",
          ],
        },
      },
    },
    {
      // No bonus feat for an elf: one General feat at the first level.
      name: "an elf fighter's first two levels",
      build: "fighter",
      values: {
        xp: 3000,
        raceName: "Elf",
        languages: ["Common", "Elven"],
        abilities: { Strength: 10, Dexterity: 16, Constitution: 12, Intelligence: 14 },
      },
      levels: fighterLevels(2),
      plan: {
        skills: { Climb: 5, Intimidate: 5, Jump: 5, Swim: 5 },
        feats: { General: ["Dodge"], "Fighter Bonus Feat": ["Improved Initiative", "Combat Reflexes"] },
      },
    },
    {
      name: "a cleric's first two levels, with two domains",
      build: "cleric",
      values: { xp: 1000 },
      levels: levelsOf("Cleric", [8, 6]),
      plan: {
        skills: { Concentration: 5, Heal: 5, Spellcraft: 5, "Knowledge (Religion)": 5 },
        feats: { General: ["Toughness", "Great Fortitude"], "Cleric Domain": ["Healing Domain", "Sun Domain"] },
      },
    },
    {
      // Specializing opens the prohibited schools in the same level.
      name: "a wizard's first level, specialized with two prohibited schools",
      build: "wizard",
      values: { raceName: "Human", languages: ["Common"], abilities: { Intelligence: 16, Constitution: 14 } },
      levels: levelsOf("Wizard", [4]),
      plan: {
        skills: {
          Spellcraft: 4,
          Concentration: 4,
          "Knowledge (Arcana)": 4,
          "Decipher Script": 4,
          "Knowledge (Religion)": 4,
          "Knowledge (Nature)": 4,
        },
        feats: { General: ["Toughness", "Great Fortitude"], ...WIZARD_FEATS },
        powers: WIZARD_SPELLS,
      },
    },
    {
      name: "a fighter level, then a wizard level that gives up schools",
      build: "wizard",
      values: {
        xp: 3000,
        raceName: "Human",
        languages: ["Common"],
        abilities: { Strength: 10, Constitution: 14, Intelligence: 16, Charisma: 8 },
      },
      levels: [
        ["Fighter", 1, 10],
        ["Wizard", 1, 4],
      ],
      plan: {
        skills: {
          Climb: 4,
          Intimidate: 4,
          Jump: 4,
          Swim: 4,
          Spellcraft: 4,
          Concentration: 4,
          "Knowledge (Arcana)": 3,
          "Handle Animal": 3,
        },
        feats: {
          General: ["Toughness", "Great Fortitude"],
          "Fighter Bonus Feat": ["Improved Initiative"],
          ...WIZARD_FEATS,
        },
        powers: WIZARD_SPELLS,
      },
    },
    {
      name: "a ranger's first two levels, with a combat style",
      build: "fighter",
      values: { xp: 1000, abilities: { Strength: 14, Dexterity: 16, Constitution: 12, Wisdom: 14 } },
      levels: levelsOf("Ranger", [8, 6]),
      plan: {
        skills: {
          Hide: 4,
          "Move Silently": 4,
          Spot: 4,
          Listen: 4,
          Survival: 4,
          Climb: 4,
          Swim: 4,
          Search: 4,
          Jump: 4,
          "Handle Animal": 4,
        },
        feats: {
          General: ["Point Blank Shot", "Precise Shot"],
          "Ranger Combat Style (2nd)": ["Rapid Shot"],
          "Favored Enemy": ["Favored Enemy: Humanoid (Goblinoid)"],
        },
      },
    },
  ];

  test.each(CASES)("saves $name, every level passing validation", async ({ build, values, levels, plan }) => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, build, values);
    const created = await finalizeBatch(ctx, characterId, levels, plan);
    expect(created).toHaveLength(levels.length);

    const levelIds = created.map((l) => l.id);
    const { feats, powers } = picks(ctx, plan);
    expect(
      (await CharacterLevelFeats.findMany(db, { characterLevelIds: levelIds })).map((f) => f.featId).sort(),
    ).toEqual(Object.values(feats).flat().sort());
    expect(
      (await CharacterLevelPowers.findMany(db, { characterLevelIds: levelIds })).map((p) => p.powerId).sort(),
    ).toEqual(Object.values(powers).flat().sort());
    const increases = await CharacterLevelAbilityIncreases.findMany(db, { characterLevelIds: levelIds });
    expect(
      created.map((l) =>
        increases
          .filter((row) => row.characterLevelId === l.id)
          .map(({ abilityId, amount }) => ({ abilityId, amount })),
      ),
    ).toEqual(levels.map(([, , , ability]) => increasesOf(ability && ctx.abilityMap[ability])));
  });

  test("spreads pooled skill ranks over the levels, within each level's rank cap", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "fighter", { xp: 1000 });
    // 16 points at the first level, 4 at the second; a first level caps ranks at 4.
    const [first, second] = await finalizeBatch(ctx, characterId, fighterLevels(2), {
      skills: { Climb: 5, Intimidate: 5, Jump: 5, Swim: 5 },
      feats: { General: ["Power Attack", "Great Fortitude"], "Fighter Bonus Feat": ["Improved Initiative", "Dodge"] },
    });
    const [atFirst, atSecond] = [
      await CharacterLevelSkills.findMany(db, { characterLevelIds: [first.id] }),
      await CharacterLevelSkills.findMany(db, { characterLevelIds: [second.id] }),
    ];
    expect(atFirst.every((s) => s.rank <= 4)).toBe(true);
    expect(atSecond.length).toBeGreaterThan(0);
    expect([...atFirst, ...atSecond].reduce((sum, s) => sum + s.rank, 0)).toBe(20);
  });

  test("refuses a batch whose picks don't fit its levels", async () => {
    const ctx = await getSeedCtx();
    const firstTwo = {
      General: ["Power Attack", "Great Fortitude"],
      "Fighter Bonus Feat": ["Improved Initiative", "Dodge"],
    };
    const refusals: [string | RegExp, () => Promise<unknown>][] = [
      // A level other than the first is checked too.
      [
        "HP must be between 1 and 10",
        async () =>
          finalizeBatch(
            ctx,
            await createSeedCharacter(ctx, "fighter", { xp: 1000 }),
            [
              ["Fighter", 1, 10],
              ["Fighter", 2, 999],
            ],
            { skills: { Climb: 5, Intimidate: 5, Jump: 5, Swim: 5 }, feats: firstTwo },
          ),
      ],
      // Errors name the level by its place in the batch.
      [
        "Level 1: Ability increase is required at this level",
        async () => {
          const characterId = await createSeedCharacter(ctx, "fighter", { xp: 6000 });
          await addFighterLevels(session, ctx, characterId, 3);
          return finalizeBatch(ctx, characterId, [["Fighter", 4, 8]], {
            skills: { Climb: 4 },
            feats: { "Fighter Bonus Feat": ["Combat Reflexes"] },
          });
        },
      ],
      [
        "Level 1: Ability increase is not available at this level",
        async () =>
          finalizeBatch(
            ctx,
            await createSeedCharacter(ctx),
            [["Fighter", 1, 10, "Strength"]],
            { skills: { Climb: 16 }, feats: FIGHTER_LEVELS[0].feats },
            true,
          ),
      ],
      [
        "unspent",
        async () =>
          finalizeBatch(ctx, await createSeedCharacter(ctx, "fighter", { xp: 1000 }), fighterLevels(2), {
            skills: { Climb: 20 },
            feats: { General: ["Power Attack"], "Fighter Bonus Feat": ["Improved Initiative", "Dodge"] },
          }),
      ],
      // A third General feat, which the pool has no room for: refused, where it used to be dropped (#476)
      [
        "General: 3 picked, room for 2",
        async () =>
          finalizeBatch(ctx, await createSeedCharacter(ctx), fighterLevels(1), {
            skills: { Climb: 16 },
            feats: {
              General: ["Power Attack", "Great Fortitude", "Toughness"],
              "Fighter Bonus Feat": ["Improved Initiative"],
            },
          }),
      ],
      // A feat that doesn't stack, in two pools.
      [
        'Non-stackable feat "Power Attack" cannot be picked more than once',
        async () =>
          finalizeBatch(ctx, await createSeedCharacter(ctx, "fighter", { xp: 1000 }), fighterLevels(2), {
            skills: { Climb: 20 },
            feats: { General: ["Power Attack", "Great Fortitude"], "Fighter Bonus Feat": ["Power Attack"] },
          }),
      ],
    ];
    for (const [error, attempt] of refusals) {
      // One at a time: the test's transaction has a single connection.
      await expect(attempt()).rejects.toThrow(error);
    }
    await expect(finalizeBatch(ctx, NIL_UUID, fighterLevels(1), {})).rejects.toThrow(NotFoundError);
  });

  test("refuses a class level the batch takes twice: the second sees the first", async () => {
    const ctx = await getSeedCtx();
    const firstTwo = {
      General: ["Power Attack", "Great Fortitude"],
      "Fighter Bonus Feat": ["Improved Initiative", "Dodge"],
    };
    const twice = finalizeBatch(
      ctx,
      await createSeedCharacter(ctx, "fighter", { xp: 1000 }),
      [
        ["Fighter", 1, 10],
        ["Fighter", 1, 10],
      ],
      { skills: { Climb: 16 }, feats: FIGHTER_LEVELS[0].feats },
    );
    await expect(twice).rejects.toMatchObject({
      message: "Level 2: This level has already been finalized",
      refusal: "invalid",
    });
    const thirdRepeatsSecond = finalizeBatch(
      ctx,
      await createSeedCharacter(ctx, "fighter", { xp: 3000 }),
      [...fighterLevels(2), ["Fighter", 2, 6]],
      { skills: { Climb: 20 }, feats: firstTwo },
    );
    await expect(thirdRepeatsSecond).rejects.toMatchObject({
      message: "Level 3: This level has already been finalized",
      refusal: "invalid",
    });
  });
});

describe("a pool's room", () => {
  const GENERAL_THREE = ["Power Attack", "Great Fortitude", "Toughness"];

  test("refuses a save's picks a pool with slots has no room for, forced or not, naming it", async () => {
    const ctx = await getSeedCtx();
    const plan = { skills: { Climb: 16 }, feats: { General: GENERAL_THREE, "Fighter Bonus Feat": ["Dodge"] } };
    for (const force of [false, true]) {
      const characterId = await createSeedCharacter(ctx);
      await expect(finalizeBatch(ctx, characterId, fighterLevels(1), plan, force)).rejects.toThrow(
        "General: 3 picked, room for 2",
      );
    }
  });

  test("refuses a third school a wizard's specialization opens room for two of, forced or not", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "wizard");
    const schools = ["Prohibit Illusion", "Prohibit Necromancy", "Prohibit Enchantment"];
    const plan = { ...WIZARD_1, feats: { ...WIZARD_1.feats, "Prohibited School": schools } };
    await expect(levelUp(session, ctx, characterId, "Wizard", 1, plan, true)).rejects.toThrow(
      "Prohibited School: 3 picked, room for 2",
    );
  });

  test("refuses an edit's picks a pool has no room for, forced or not", async () => {
    const { resave } = await setupFighter();
    const plan = { feats: { General: GENERAL_THREE, "Fighter Bonus Feat": ["Improved Initiative"] } };
    for (const force of [false, true])
      await expect(resave(plan, force)).rejects.toThrow("General: 3 picked, room for 2");
  });

  test("fits a preview's picks to their pools: a pool past its room drops its latest", async () => {
    const ctx = await getSeedCtx();
    const result = await preview(ctx, await createSeedCharacter(ctx), fighter(1), undefined, {
      feats: { General: GENERAL_THREE },
    });
    const general = ctx.aptMap["General"];
    expect(result.feats.fitted[general]).toEqual([ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]]);
    // Its room for the feats picked in it: what it had left, before them
    expect(result.feats.aptitudePools[general]).toMatchObject({ allowed: 2, available: 2, spent: 0 });
  });

  test("grows a pool by a picked feat's room, and drops what's in it with the feat", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "wizard");
    const schools = ["Prohibit Illusion", "Prohibit Necromancy"];
    const specialized = { "Wizard Specialization": ["Evocation Specialist"], "Prohibited School": schools };
    const withFeat = await preview(ctx, characterId, [["Wizard", 1]], undefined, { feats: specialized });
    const prohibited = ctx.aptMap["Prohibited School"];
    expect(withFeat.feats.aptitudePools[prohibited]).toMatchObject({ available: 2 });
    expect(withFeat.feats.fitted[prohibited]).toHaveLength(2);
    const without = await preview(ctx, characterId, [["Wizard", 1]], undefined, {
      feats: { "Prohibited School": schools },
    });
    expect(without.feats.fitted[prohibited]).toEqual([]);
  });

  test("answers an edited level's feat step with its room for the picks, and what of them fits", async () => {
    const { ctx, characterId, first } = await setupFighter();
    const general = ctx.aptMap["General"];
    const step = await CharacterLevelsService.getStep(session, characterId, "feats", {
      classId: ctx.klassMap.pc["Fighter"],
      level: 1,
      editedLevelId: first.id,
      featPicks: GENERAL_THREE.map((name) => ({ aptitudeId: general, featId: ctx.featMap[name] })),
    });
    if (step.name !== "feats") throw new Error("Expected the feats step");
    expect(step.fitted[general]).toEqual([ctx.featMap["Power Attack"], ctx.featMap["Great Fortitude"]]);
    expect(step.aptitudePools[general]).toMatchObject({ available: 2 });
  });
});

describe("previewing a level-up", () => {
  test("describes each level, its skill points and where the ability increase falls", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    const result = await preview(ctx, characterId, fighter(4));

    expect(result.levelDetails).toMatchObject(
      fighter(4).map(([, level]) => ({
        klassId: ctx.klassMap.pc["Fighter"],
        level,
        hd: 10,
        // A d10's: 1 to 10, 5 on average, which the HP step reads
        hitPoints: { average: 5, max: 10, min: 1 },
      })),
    );
    expect(result.perLevelSkillPoints).toEqual([16, 4, 4, 4]);
    expect(result.skills).toMatchObject({ skillPointsToSpend: 28, totalCharacterLevel: 4 });
    expect(result.skills.skills.length).toBeGreaterThan(0);
    // The fourth level of the batch, by its index.
    expect(result.attributes.abilityIncreaseLevels).toEqual([3]);

    await addFighterLevels(session, ctx, characterId, 1);
    // Only a character's first level gets ×4.
    expect((await preview(ctx, characterId, [["Fighter", 2]])).perLevelSkillPoints).toEqual([4]);
    await expect(preview(ctx, NIL_UUID, fighter(1))).rejects.toThrow(NotFoundError);
  });

  test("shows the base attributes, raised only by the increases chosen at the levels that take one", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    const intelligence = async (abilities: (string | null)[]) =>
      (await preview(ctx, characterId, fighter(4), abilities)).attributes.attributes["intelligence"];
    expect((await intelligence([null, null, null, null])).total).toBe(12);
    expect(await intelligence([null, null, null, ctx.abilityMap["Intelligence"]])).toMatchObject({
      total: 13,
      modifier: 1,
    });
    // A pick the plan moved off an increase level (the first takes none) raises nothing
    expect((await intelligence([ctx.abilityMap["Intelligence"], null, null, null])).total).toBe(12);
  });

  test("raises every level's skill points with an Intelligence increase, as 3.5 grants them retroactively", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "fighter", { abilities: { Intelligence: 13 } });
    const raised = await preview(ctx, characterId, fighter(4), [null, null, null, ctx.abilityMap["Intelligence"]]);
    // Each level's 2 + 2 (INT 14), and the human's 1 beside: 20 at the first level, 5 at the others
    expect(raised.perLevelSkillPoints).toEqual([20, 5, 5, 5]);
    expect(raised.skills.skillPointsToSpend).toBe(35);
  });

  test("spends the skill points as the save spreads them, each skill with its ranks by points", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    const { skills } = await preview(ctx, characterId, fighter(1), [null], { skills: { Climb: 6, Hide: 3 } });
    const skill = (name: string) => skills.skills.find((s) => s.id === ctx.skillMap[name])!;
    // Climb, a fighter's class skill, caps at 4 ranks at level 1: its 2 points over the cap aren't kept
    expect(skill("Climb")).toMatchObject({
      classSkill: true,
      points: 4,
      ranks: 4,
      rankStep: 1,
      ranksByPoints: [0, 1, 2, 3, 4],
      maxPoints: 4,
    });
    // Hide, cross-class, takes two points a rank, up to 2 ranks
    expect(skill("Hide")).toMatchObject({ classSkill: false, points: 3, ranks: 1.5, rankStep: 0.5 });
    expect(skill("Hide").ranksByPoints).toEqual([0, 0.5, 1, 1.5, 2]);
    // A skill no points went to reads what it would gain, within the points the others leave
    expect(skill("Swim")).toMatchObject({ points: 0, ranks: 0, maxPoints: 4 });
    expect(skill("Swim").ranksByPoints).toEqual([0, 1, 2, 3, 4]);
  });

  test("counts a human's bonus feat in the first level's General slots: its next feat goes there, then on the third", async () => {
    const ctx = await getSeedCtx();
    const nextGeneral = async (characterId: string, count: number, general: string[]) => {
      const result = await preview(ctx, characterId, fighter(count), undefined, { feats: { General: general } });
      return result.nextPickLevels.feats[ctx.aptMap.General];
    };
    // A human's bonus feat and its first level's: two at the first level, then one at the third
    const human = await createSeedCharacter(ctx);
    expect(await nextGeneral(human, 4, [])).toBe(0);
    expect(await nextGeneral(human, 4, ["Power Attack"])).toBe(0);
    expect(await nextGeneral(human, 4, ["Power Attack", "Great Fortitude"])).toBe(2);
    // An elf's first level's alone: once it's taken, a pick goes on the last level
    const elf = await createSeedCharacter(ctx, "fighter", { raceName: "Elf", languages: ["Common", "Elven"] });
    expect(await nextGeneral(elf, 2, [])).toBe(0);
    expect(await nextGeneral(elf, 2, ["Power Attack"])).toBe(1);
  });

  test("gives a sorcerer's spell pool cantrip and first-level slots at each level", async () => {
    const ctx = await getSeedCtx();
    const sorcerer = await createSeedCharacter(ctx, "sorcerer");
    const levels: [string, number][] = [
      ["Sorcerer", 1],
      ["Sorcerer", 2],
    ];
    const result = await preview(ctx, sorcerer, levels);
    const spells = Object.values(result.powers.aptitudePools).find((pool) => pool.name === "Sorcerer Spells")!;
    expect(spells).toMatchObject({ leveled: true });
    expect(spells.levels?.["0"]?.available).toBeGreaterThan(0);
    expect(spells.levels?.["1"]?.available).toBeGreaterThan(0);
    expect(result.nextPickLevels.powers[spells.id]).toMatchObject({ "0": 0, "1": 0 });
    // The first level's four cantrips taken, the next goes on the second
    const cantrips = ["Detect Magic", "Light", "Read Magic", "Mage Hand"];
    const picked = await preview(ctx, sorcerer, levels, undefined, { powers: { "Sorcerer Spells": cantrips } });
    expect(picked.nextPickLevels.powers[spells.id]["0"]).toBe(1);
    expect(picked.powers.fitted[spells.id]).toEqual(cantrips.map((name) => ctx.powerMap[name]));
  });
});

describe("the feats of a level in a batch", () => {
  test("count what earlier levels of the batch pick", async () => {
    // Cleave needs Power Attack.
    expect(await eligible("Cleave", 1)).toBe(false);
    expect(await eligible("Cleave", 1, { pendingPicks: ["Power Attack"] })).toBe(true);
    expect(await eligible("Cleave", 4, { pendingPicks: ["Power Attack"] })).toBe(true);
  });

  test("count the picked level once", async () => {
    // Leadership needs character level 6: picked at the batch's 5th level, the character has 5
    expect(await eligible("Leadership", 5)).toBe(false);
    expect(await eligible("Leadership", 6)).toBe(true);
  });

  test("count the batch's ability increases", async () => {
    // Power Attack needs STR 13.
    expect(await eligible("Power Attack", 4, { strength: 12 })).toBe(false);
    expect(
      await eligible("Power Attack", 4, {
        strength: 12,
        increases: [undefined, undefined, undefined, (await getSeedCtx()).abilityMap["Strength"]],
      }),
    ).toBe(true);
  });
});

describe("re-saving a level", () => {
  test("refuses ranks above the level's cap, and a pool left unspent", async () => {
    const { resave } = await setupFighter();
    await expect(resave({ skills: { Climb: 8, Intimidate: 4, Jump: 4 } })).rejects.toThrow("rank");
    await expect(
      resave({ feats: { General: ["Power Attack", "Great Fortitude"], "Fighter Bonus Feat": [] } }),
    ).rejects.toThrow(/Fighter Bonus Feat.*unspent/);
  });

  test("refuses a pool that a feat picked at the level opens, left unspent", async () => {
    // Regression: only granted feats' pools were checked, so a specialization's prohibited schools could be left empty.
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx, "wizard", {
      raceName: "Human",
      languages: ["Common"],
      abilities: { Intelligence: 16, Constitution: 14 },
    });
    const plan: LevelPlan = {
      hp: 4,
      skills: {
        Spellcraft: 4,
        Concentration: 4,
        "Knowledge (Arcana)": 4,
        "Decipher Script": 4,
        "Knowledge (Religion)": 4,
        "Knowledge (Nature)": 4,
      },
      feats: {
        General: ["Toughness", "Great Fortitude"],
        "Wizard Specialization": ["Evocation Specialist"],
        "Prohibited School": ["Prohibit Illusion", "Prohibit Necromancy"],
        "Familiar Bond": ["Cat Familiar"],
      },
      powers: {
        "Wizard Spells": [
          "Detect Magic",
          "Read Magic",
          "Mage Hand",
          "Light",
          "Ray of Frost",
          "Resistance",
          "Magic Missile",
          "Shield",
          "Mage Armor",
        ],
      },
    };
    const level = await levelUp(session, ctx, characterId, "Wizard", 1, plan);
    const { skills, feats, powers } = picks(ctx, { ...plan, feats: { ...plan.feats, "Prohibited School": [] } });
    await expect(
      CharacterLevelsService.updateLevel(session, characterId, level.id, 4, [], skills, feats, powers),
    ).rejects.toThrow(/Prohibited School.*unspent/);
  });

  describe("an ability increase", () => {
    test("is refused at a level that doesn't grant one, even forced", async () => {
      const { ctx, resave } = await setupFighter();
      for (const force of [false, true]) {
        await expect(resave({ abilityId: ctx.abilityMap["Strength"] }, force)).rejects.toThrow(
          "Ability increase is not available at this level",
        );
      }
    });

    test("saved there before the check existed is refused again, and can be cleared", async () => {
      const { ctx, first, resave } = await setupFighter();
      await db
        .insert(levelAbilityIncreasesInCharacter)
        .values({ characterLevelId: first.id, abilityId: ctx.abilityMap["Strength"], amount: 1 });
      // The edit dialog sends the stored increase back.
      await expect(resave({ abilityId: ctx.abilityMap["Strength"] })).rejects.toThrow(
        "Ability increase is not available at this level",
      );
      await resave({ abilityId: null });
      expect(await CharacterLevelAbilityIncreases.findMany(db, { characterLevelIds: [first.id] })).toEqual([]);
    });

    test("at a level that grants one raises one ability by 1, read back with the level", async () => {
      const ctx = await getSeedCtx();
      const characterId = await createSeedCharacter(ctx, "fighter", { xp: 6000 });
      const [strength, dexterity] = [ctx.abilityMap["Strength"], ctx.abilityMap["Dexterity"]];
      const save = (increases: AbilityIncrease[]) =>
        CharacterLevelsService.finalizeLevelUp(
          session,
          characterId,
          [1, 2, 3, 4].map((level) => ({
            abilityIncreases: level === 4 ? increases : [],
            hp: 6,
            klassId: ctx.klassMap.pc["Fighter"],
            level,
          })),
          {},
          {},
          {},
          true,
        );
      await expect(save([{ abilityId: strength, amount: 2 }])).rejects.toThrow(
        "Level 4: Ability increases must add up to 1 at this level",
      );
      await expect(
        save([
          { abilityId: strength, amount: 1 },
          { abilityId: dexterity, amount: 1 },
        ]),
      ).rejects.toThrow("Level 4: Ability increases must add up to 1 at this level");
      await expect(
        save([
          { abilityId: strength, amount: 1 },
          { abilityId: strength, amount: 1 },
        ]),
      ).rejects.toThrow("Level 4: An ability is increased twice at this level");

      const saved = await save([{ abilityId: strength, amount: 1 }]);
      const level = await CharacterLevelsService.getLevel(session, characterId, saved[3].id);
      expect(level.abilityIncreases).toEqual([{ abilityId: strength, amount: 1 }]);
    });
  });
});
