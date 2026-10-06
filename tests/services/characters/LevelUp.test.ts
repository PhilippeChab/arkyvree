import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { SEED_USER_ID, type SeedContext } from "@/database/seeds/helpers.ts";
import { levelsInCharacter } from "@/drizzle/schema.ts";
import { db } from "@/server/database/index.ts";
import { BadRequestError, NotFoundError } from "@/server/errors/index.ts";
import {
  CharacterLevelFeats,
  CharacterLevelPowers,
  CharacterLevels,
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
} from "@/tests/support/levelFixtures.ts";
import { getSeedCtx, NIL_UUID } from "@/tests/support/seed.ts";
import { makeSession } from "@/tests/support/users.ts";

/** A level of a batch: class, level, hit points and the ability it increases. */
type BatchLevel = [klass: string, level: number, hp: number, ability?: string];

const session = makeSession(SEED_USER_ID);

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
    abilityId: ability ? ctx.abilityMap[ability] : null,
  }));
  return CharacterLevelsService.finalizeLevelUp(session, characterId, batch, skills, feats, powers, force);
}

function levelsOf(klass: string, hps: number[]): BatchLevel[] {
  return hps.map((hp, index) => [klass, index + 1, hp]);
}

/** Whether a feat is eligible at `level` of a batch of fighter levels, with these earlier picks and increases. */
async function eligible(
  search: string,
  level: number,
  options: { strength?: number; pendingPicks?: string[]; increases?: (string | undefined)[] } = {},
) {
  const ctx = await getSeedCtx();
  const characterId = await createSeedCharacter(ctx, "fighter", {
    xp: 6000,
    abilities: { Strength: options.strength ?? 14 },
  });
  const { levelDetails } = await CharacterLevelsService.getLevelUpPreview(
    session,
    characterId,
    FIGHTER_LEVELS.slice(0, level).map((_, i) => ({ klassId: ctx.klassMap.pc["Fighter"], level: i + 1 })),
    FIGHTER_LEVELS.slice(0, level).map(() => null),
  );
  const pendingLevelFeatPicks = (options.pendingPicks ?? []).map((name) => ({
    featId: ctx.featMap[name],
    aptitudeId: ctx.aptMap["General"],
  }));
  const { items } = await CharacterLevelsService.getAvailableFeatsGrouped(
    session,
    characterId,
    ctx.aptMap["General"],
    ctx.klassMap.pc["Fighter"],
    level,
    { search, selectedFeatPicks: [], pendingLevelFeatPicks },
    { limit: 20, page: 1 },
    undefined,
    levelDetails.map((d) => d.klassLevelId),
    options.increases,
  );
  return items.find((row) => row.displayName === search)!.eligible;
}

async function preview(
  ctx: SeedContext,
  characterId: string,
  levels: [string, number][],
  abilities: (string | null)[] = levels.map(() => null),
) {
  return CharacterLevelsService.getLevelUpPreview(
    session,
    characterId,
    levels.map(([klass, level]) => ({ klassId: ctx.klassMap.pc[klass], level })),
    abilities,
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
      plan.abilityId ?? null,
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
    name: string;
    build: keyof typeof BUILDS;
    values?: Parameters<typeof createSeedCharacter>[2];
    levels: BatchLevel[];
    plan: Omit<LevelPlan, "hp">;
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
    expect(created.map((l) => l.abilityId)).toEqual(
      levels.map(([, , , ability]) => (ability ? ctx.abilityMap[ability] : null)),
    );
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
    const refusals: [string | RegExp | typeof BadRequestError, () => Promise<unknown>][] = [
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
      [
        BadRequestError,
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
        BadRequestError,
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
});

describe("previewing a level-up", () => {
  test("describes each level, its skill points and where the ability increase falls", async () => {
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    const result = await preview(ctx, characterId, fighter(4));

    expect(result.levelDetails).toMatchObject(
      fighter(4).map(([, level]) => ({ klassId: ctx.klassMap.pc["Fighter"], level, hd: 10 })),
    );
    expect(result.perLevelSkillPoints).toEqual([16, 4, 4, 4]);
    expect(result.skills).toMatchObject({ skillPointsToSpend: 28, totalCharacterLevel: 4 });
    // What the wizard recomputes them from: each level's 2 + 1 (INT 13) before the minimum, and the human's 1 beside.
    expect(result.perLevelSkillPointBases).toEqual([3, 3, 3, 3]);
    expect(result.skills).toMatchObject({ pointsPerLevel: [3, 3, 3, 3], bonusPerLevel: 1 });
    expect(result.skills.skills.length).toBeGreaterThan(0);
    // The fourth level of the batch, by its index.
    expect(result.attributes.abilityIncreaseLevels).toEqual([3]);

    await addFighterLevels(session, ctx, characterId, 1);
    // Only a character's first level gets ×4.
    expect((await preview(ctx, characterId, [["Fighter", 2]])).perLevelSkillPoints).toEqual([4]);
    await expect(preview(ctx, NIL_UUID, fighter(1))).rejects.toThrow(NotFoundError);
  });

  test("shows the base attributes, raised only by the increases chosen", async () => {
    // The level-up wizard adds a chosen increase itself: counting it twice would show the wrong totals.
    const ctx = await getSeedCtx();
    const characterId = await createSeedCharacter(ctx);
    expect((await preview(ctx, characterId, fighter(4))).attributes.attributes["intelligence"].total).toBe(12);
    expect(
      (await preview(ctx, characterId, fighter(4), [null, null, null, ctx.abilityMap["Intelligence"]])).attributes
        .attributes["intelligence"].total,
    ).toBe(13);
  });

  test("counts a human's bonus feat in the first level's General slots", async () => {
    const ctx = await getSeedCtx();
    const generalSlots = async (characterId: string, count: number) => {
      const result = await preview(ctx, characterId, fighter(count));
      const [generalId] = Object.entries(result.feats.aptitudePools).find(([, pool]) => pool.name === "General")!;
      return result.perLevelFeatSlots[generalId];
    };
    expect(await generalSlots(await createSeedCharacter(ctx), 4)).toEqual([2, 0, 1, 0]);
    expect(
      await generalSlots(
        await createSeedCharacter(ctx, "fighter", { raceName: "Elf", languages: ["Common", "Elven"] }),
        2,
      ),
    ).toEqual([1, 0]);
  });

  test("gives a sorcerer's spell pool cantrip and first-level slots at each level", async () => {
    const ctx = await getSeedCtx();
    const result = await preview(ctx, await createSeedCharacter(ctx, "sorcerer"), [
      ["Sorcerer", 1],
      ["Sorcerer", 2],
    ]);
    const spells = Object.values(result.powers.aptitudePools).find((pool) => pool.name === "Sorcerer Spells")!;
    expect(spells).toMatchObject({ leveled: true });
    expect(spells.available).toBeGreaterThan(0);
    const [first] = result.perLevelPowerSlots[spells.id];
    expect(result.perLevelPowerSlots[spells.id]).toHaveLength(2);
    expect(first["0"]).toBeGreaterThan(0);
    expect(first["1"]).toBeGreaterThan(0);
  });
});

describe("the feats of a level in a batch", () => {
  test("count what earlier levels of the batch pick", async () => {
    // Cleave needs Power Attack.
    expect(await eligible("Cleave", 1)).toBe(false);
    expect(await eligible("Cleave", 1, { pendingPicks: ["Power Attack"] })).toBe(true);
    expect(await eligible("Cleave", 4, { pendingPicks: ["Power Attack"] })).toBe(true);
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
      CharacterLevelsService.updateLevel(session, characterId, level.id, 4, null, skills, feats, powers),
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
        .update(levelsInCharacter)
        .set({ abilityId: ctx.abilityMap["Strength"] })
        .where(eq(levelsInCharacter.id, first.id));
      // The edit dialog sends the stored increase back.
      await expect(resave({ abilityId: ctx.abilityMap["Strength"] })).rejects.toThrow(
        "Ability increase is not available at this level",
      );
      await resave({ abilityId: null });
      expect(await CharacterLevels.findOne(db, { id: first.id })).toMatchObject({ abilityId: null });
    });
  });
});
