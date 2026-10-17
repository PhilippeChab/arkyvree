import { describe, expect, test } from "bun:test";

import PcgenFile from "@/engine/core/imports/pcgen/PcgenFile.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { ImportPlan } from "@/engine/index.ts";
import PcgenImport from "@/engine/rulesets/dnd3.5/imports/pcgen/PcgenImport.ts";
import { SEED_USER_ID } from "@/scripts/db/seeds/users.ts";
import { RulesetViews, withRulesetScope } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { planImportOf, readPcgenFile } from "@/tests/support/dnd3.5/pcgenFiles.ts";
import { createTestItem } from "@/tests/support/items.ts";
import { createSeededTestRuleset, invalidateSeededRuleset } from "@/tests/support/rulesets.ts";
import { getSeedCtx } from "@/tests/support/seed.ts";

/** Each skill's points over every level of a plan. */
function totalPoints(levels: Awaited<ReturnType<typeof nameLevels>>) {
  const totals: Record<string, number> = {};
  for (const level of levels)
    for (const [name, points] of Object.entries(level.skills)) totals[name] = (totals[name] ?? 0) + points;
  return totals;
}

/**
 * A plan's levels named: each its class and class level, its ability increases, its feats, and the points it spends on
 * each skill.
 */
async function nameLevels(plan: ImportPlan) {
  const data = await seededData();
  return plan.levels.map(({ columns, rows }) => {
    const klassLevel = data.klassLevelsById.get(columns.klassLevelId)!;
    return {
      hp: columns.hp,
      increases: rows.abilityIncreases.map(
        ({ abilityId, amount }) => `${data.abilitiesById.get(abilityId)?.name} +${amount}`,
      ),
      feats: rows.feats.map(({ featId }) => data.featsById.get(featId)?.name),
      klass: `${data.klassesById.get(klassLevel.klassId)?.name} ${klassLevel.level}`,
      skills: Object.fromEntries(
        rows.skills.map(({ rank, skillId }): [string, number] => [data.skillsById.get(skillId)?.name ?? skillId, rank]),
      ),
    };
  });
}

/** The refusal `plan` throws. */
async function refusalOf(plan: Promise<unknown>) {
  try {
    await plan;
  } catch (error) {
    if (error instanceof RulesError) return { message: error.message, refusal: error.refusal };
    throw error;
  }
  throw new Error("The import wasn't refused");
}

/** The seeded ruleset's view, which names what a plan writes by id. */
async function seededData() {
  const { rulesetId } = await getSeedCtx();
  return await RulesetViews.getData((await Rulesets.findOne(db, { id: rulesetId }))!);
}

describe("A PCGen fighter / rogue", () => {
  test("is leveled up one level at a time, each level passing a level-up's checks", async () => {
    const plan = await planImportOf(await readPcgenFile("brannoc"));
    expect(plan.report.issues).toEqual([]);
    const levels = await nameLevels(plan);
    expect(levels.map(({ hp, klass }) => `${klass} (${hp})`)).toEqual([
      "Fighter 1 (10)",
      "Fighter 2 (7)",
      "Fighter 3 (6)",
      "Fighter 4 (8)",
      "Rogue 1 (4)",
      "Rogue 2 (5)",
      "Fighter 5 (9)",
      "Fighter 6 (6)",
    ]);
    // Weapon Specialization waits for Fighter 4, after the Weapon Focus and the proficiency it requires
    const levelOf = (feat: string) => levels.findIndex((level) => level.feats.includes(feat));
    expect(levelOf("Weapon Specialization: Bastard Sword")).toBeGreaterThanOrEqual(3);
    expect(levelOf("Weapon Focus: Bastard Sword")).toBeLessThan(levelOf("Weapon Specialization: Bastard Sword"));
    expect(levelOf("Exotic Weapon Proficiency: Bastard Sword")).toBeLessThanOrEqual(
      levelOf("Weapon Focus: Bastard Sword"),
    );
    expect(levelOf("Cleave")).toBeGreaterThan(levelOf("Power Attack"));
    expect(levels.flatMap((level) => level.feats).toSorted()).toEqual([
      "Cleave",
      "Dodge",
      "Exotic Weapon Proficiency: Bastard Sword",
      "Mobility",
      "Power Attack",
      "Toughness",
      "Weapon Focus: Bastard Sword",
      "Weapon Specialization: Bastard Sword",
    ]);
  });

  test("keeps the file's scores: its starting ones, and an increase at the 4th and 8th levels", async () => {
    const plan = await planImportOf(await readPcgenFile("brannoc"));
    const data = await seededData();
    const scores = Object.fromEntries(
      plan.abilities.map(({ abilityId, score }) => [data.abilitiesById.get(abilityId)?.name, score]),
    );
    expect(scores).toEqual({
      Charisma: 8,
      Constitution: 14,
      Dexterity: 14,
      Intelligence: 12,
      Strength: 16,
      Wisdom: 10,
    });
    expect((await nameLevels(plan)).map((level) => level.increases)).toEqual([
      [],
      [],
      [],
      ["Strength +1"],
      [],
      [],
      [],
      ["Strength +1"],
    ]);
  });

  test("places each skill's ranks on the levels of the class they were bought in, within their maximum", async () => {
    const levels = await nameLevels(await planImportOf(await readPcgenFile("brannoc")));
    expect(totalPoints(levels)).toEqual({
      Climb: 11,
      Hide: 4,
      Intimidate: 8,
      Jump: 9,
      "Move Silently": 4,
      Ride: 4,
      Spot: 3,
      Swim: 4,
      Tumble: 9,
    });
    // The ranks bought as a rogue go on the rogue's levels, those bought as a fighter on the fighter's
    const rogueSkills = new Set(["Hide", "Move Silently", "Spot", "Tumble"]);
    for (const level of levels) {
      const rogue = level.klass.startsWith("Rogue");
      for (const skill of Object.keys(level.skills)) expect(rogueSkills.has(skill)).toBe(rogue);
    }
    // 4 ranks at the first level, its maximum
    expect(levels[0].skills.Climb).toBe(4);
  });

  test("speaks the language it picked, and holds its gear where the file wears it", async () => {
    const plan = await planImportOf(await readPcgenFile("brannoc"));
    const data = await seededData();
    expect(plan.languageIds.map((id) => data.languagesById.get(id)?.name)).toEqual(["Dwarven"]);
    const worn = plan.inventory
      .filter((entry) => entry.equipped)
      .map((entry) =>
        `${data.itemsById.get(entry.itemId)?.name}: ${entry.location} ${entry.weaponSets.join(",")}`.trim(),
      );
    expect(worn.toSorted()).toEqual([
      "Bastard Sword: Main Hand 0",
      "Chain Mail: Torso",
      "Heavy Steel Shield: Off Hand 0",
      "Ring of Protection +1: Finger",
    ]);
    const carried = plan.inventory
      .filter((entry) => !entry.equipped)
      .map((entry) => data.itemsById.get(entry.itemId)?.name);
    expect(carried).toContain("Rope, hempen (50 ft.)");
    expect(carried).toContain("Backpack (empty)");
    expect(
      plan.inventory.find((entry) => data.itemsById.get(entry.itemId)?.name === "Rations, trail (per day)")?.quantity,
    ).toBe(5);
  });

  test("reports what it imported, and every line it couldn't match: magic gear to make, an item the ruleset hasn't", async () => {
    const { report, character } = await planImportOf(await readPcgenFile("brannoc"));
    expect(report.program).toBe("PCGen 6.09.08.RC1");
    expect(report.imported).toContain("Race: Human");
    expect(character).toMatchObject({
      alignment: "Lawful Neutral",
      gender: "Male",
      height: `6' 0"`,
      name: "Brannoc Vale",
      xp: 29500,
    });
    const reasons = report.unmatched.map(({ reason }) => reason);
    expect(reasons).toContain(
      "Longsword +1 is magic gear the ruleset has no item of: make it in the ruleset (from Longsword), then add it",
    );
    expect(reasons).toContain("Potion (Cure Light Wounds) isn't an item of the ruleset");
    // Each names its line of the file
    for (const { line, text } of report.unmatched) {
      expect(text.length).toBeGreaterThan(0);
      expect(line).toBeGreaterThan(0);
    }
  });

  test("matches names in the picked ruleset: a custom ruleset's own item is found", async () => {
    const fork = await createSeededTestRuleset(SEED_USER_ID);
    await createTestItem({ name: "Longsword +1", rulesetId: fork.id });
    const plan = await planImportOf(await readPcgenFile("brannoc"), fork.id);
    invalidateSeededRuleset(fork.id);
    expect(
      plan.report.unmatched.map(({ text }) => text).some((text) => text.startsWith("EQUIPNAME:Longsword +1")),
    ).toBe(false);
    expect(plan.report.imported).toContain("Item: Longsword +1 ×1");
  });

  test("imports the levels before a class the ruleset hasn't, and lists that level and those after it", async () => {
    const text = (await readPcgenFile("brannoc")).replaceAll("Rogue", "Swashbuckler");
    const plan = await planImportOf(text);
    expect((await nameLevels(plan)).map((level) => level.klass)).toEqual([
      "Fighter 1",
      "Fighter 2",
      "Fighter 3",
      "Fighter 4",
    ]);
    const reasons = plan.report.unmatched
      .filter(({ text: line }) => line.startsWith("CLASSABILITIESLEVEL"))
      .map(({ reason }) => reason);
    // The levels it takes give the increases: the 8th's, which it doesn't take, stays in the starting score
    const data = await seededData();
    const strength = plan.abilities.find(({ abilityId }) => data.abilitiesById.get(abilityId)?.name === "Strength");
    expect(strength?.score).toBe(17);
    expect(plan.report.issues).toEqual([]);
    expect(reasons).toEqual([
      "Swashbuckler isn't a class of the ruleset",
      "A level before it couldn't be imported",
      "A level before it couldn't be imported",
      "A level before it couldn't be imported",
    ]);
  });
});

describe("What a file holds past what the app keeps", () => {
  test("a level taken twice stops the levels there, which the report lists", async () => {
    const text = (await readPcgenFile("brannoc")).replace(
      "CLASSABILITIESLEVEL:Fighter=2|",
      "CLASSABILITIESLEVEL:Fighter=1|",
    );
    const plan = await planImportOf(text);
    expect((await nameLevels(plan)).map((level) => level.klass)).toEqual(["Fighter 1"]);
    expect(
      plan.report.unmatched.find(({ text: line }) => line.startsWith("CLASSABILITIESLEVEL:Fighter=1|HITPOINTS:7"))
        ?.reason,
    ).toBe("Fighter 1 can't be taken there");
  });

  test("a recorded change of an ability the ruleset hasn't is left out, the level's increase taken all the same", async () => {
    const text = (await readPcgenFile("brannoc")).replace(
      "Fighter=4|HITPOINTS:8|PRESTAT:STR=1",
      "Fighter=4|HITPOINTS:8|PRESTAT:XYZ=1",
    );
    const plan = await planImportOf(text);
    expect((await nameLevels(plan))[3].increases).toEqual(["Strength +1"]);
    expect(plan.report.issues).toContain("Level 4: XYZ isn't an ability of the ruleset: its change is left out");
  });

  test("its experience past the largest the app keeps, a name too long, a gender of its own", async () => {
    const text = (await readPcgenFile("brannoc"))
      .replace("EXPERIENCE:29500", "EXPERIENCE:99999999999")
      .replace("CHARACTERNAME:Brannoc Vale", `CHARACTERNAME:${"B".repeat(300)}`)
      .replace("GENDER:Male", "GENDER:Unknown");
    const { character, report } = await planImportOf(text);
    expect(character.xp).toBe(2_147_483_647);
    expect(character.name).toHaveLength(255);
    expect(character.gender).toBe("Other");
    expect(report.issues).toContain("Experience 99999999999 is past the largest the app keeps: 2147483647 kept");
    expect(report.unmatched.map(({ reason }) => reason)).toContain("Unknown isn't a gender of the app's: Other kept");
  });

  test("a height in inches with a fraction, in whole feet and inches", async () => {
    const text = (await readPcgenFile("brannoc")).replace("HEIGHT:72", "HEIGHT:71.6");
    expect((await planImportOf(text)).character.height).toBe(`6' 0"`);
  });

  test("a feat two lines name is picked once, the second listed", async () => {
    const line = "ABILITY:FEAT|TYPE:NORMAL|CATEGORY:FEAT|KEY:Power Attack";
    const text = (await readPcgenFile("brannoc")).replace(line, `${line}|TYPE:General\n${line}|TYPE:General`);
    const plan = await planImportOf(text);
    expect(
      (await nameLevels(plan)).flatMap((level) => level.feats).filter((feat) => feat === "Power Attack"),
    ).toHaveLength(1);
    expect(plan.report.unmatched.map(({ reason }) => reason)).toContain(
      "Power Attack is imported already, from another line",
    );
  });

  test("a feat that stacks, two lines naming it, isn't listed as imported already", async () => {
    const line =
      "ABILITY:FEAT|TYPE:NORMAL|CATEGORY:FEAT|KEY:Toughness|APPLIEDTO:|TYPE:General|DESC:You gain +3 hit points.";
    const text = (await readPcgenFile("brannoc")).replace(line, `${line}\n${line}`);
    const reasons = (await planImportOf(text)).report.unmatched.map(({ reason }) => reason);
    expect(reasons).not.toContain("Toughness is imported already, from another line");
    expect(reasons).toContain("Toughness: no level could take it (its requirements, or no room left)");
  });

  test("a score its increases leave past a new character's bounds, brought to them", async () => {
    const plan = await planImportOf((await readPcgenFile("brannoc")).replace("STAT:CHA|SCORE:8", "STAT:CHA|SCORE:0"));
    const data = await seededData();
    const charisma = plan.abilities.find(({ abilityId }) => data.abilitiesById.get(abilityId)?.name === "Charisma");
    expect(charisma?.score).toBe(1);
    expect(plan.report.issues).toContain("Charisma would start at 0, outside 1 to 100: it starts at 1");
  });

  test("a gender in another case, or its initial", async () => {
    const text = (await readPcgenFile("brannoc")).replace("GENDER:Male", "GENDER:f");
    expect((await planImportOf(text)).character.gender).toBe("Female");
  });
});

describe("A PCGen cleric", () => {
  test("takes its domains at its first level, in the cleric's domain pool", async () => {
    const levels = await nameLevels(await planImportOf(await readPcgenFile("hilda")));
    expect(levels[0].feats.toSorted()).toEqual(["Combat Casting", "Protection Domain", "Strength Domain"]);
    expect(levels[2].feats).toEqual(["Extra Turning"]);
  });

  test("keeps a change the file recorded off the increases' levels in its starting score, and says so", async () => {
    const plan = await planImportOf(await readPcgenFile("hilda"));
    const data = await seededData();
    const scores = Object.fromEntries(
      plan.abilities.map(({ abilityId, score }) => [data.abilitiesById.get(abilityId)?.name, score]),
    );
    expect(scores).toMatchObject({ Constitution: 14, Wisdom: 15 });
    expect((await nameLevels(plan))[3].increases).toEqual(["Wisdom +1"]);
    expect(plan.report.issues).toContain(
      "Level 3: Constitution +1 isn't an increase the ruleset gives there: kept in the starting score",
    );
  });

  test("lists its spells, which aren't imported yet", async () => {
    const { report } = await planImportOf(await readPcgenFile("hilda"));
    const spells = report.unmatched.filter(({ reason }) => reason === "Spells aren't imported yet");
    expect(spells.map(({ text }) => text.split("|")[0])).toEqual([
      "SPELLNAME:Bless",
      "SPELLNAME:Bull's Strength",
      "SPELLNAME:Cure Light Wounds",
    ]);
  });
});

describe("A level a level-up refuses", () => {
  test("stops the levels there when the import is planned again: the levels after it listed, their increases out", async () => {
    const { rulesetId } = await getSeedCtx();
    const imported = new PcgenFile(await readPcgenFile("brannoc")).read();
    const owner = { characterId: crypto.randomUUID(), userId: SEED_USER_ID };
    const stop = { count: 5, reason: "A level-up refuses it: test" };
    const planned = await withRulesetScope(db, rulesetId, async (scope) =>
      new PcgenImport(scope, imported, owner, stop).plan(),
    );
    if (!("plan" in planned)) throw new Error("The import was refused again");
    const { plan } = planned;
    expect(plan.levels).toHaveLength(5);
    const data = await seededData();
    const strength = plan.abilities.find(({ abilityId }) => data.abilitiesById.get(abilityId)?.name === "Strength");
    expect(strength?.score).toBe(17);
    const levels = plan.report.unmatched.filter(({ text }) => text.startsWith("CLASSABILITIESLEVEL"));
    expect(levels.map(({ reason }) => reason)).toEqual([
      "A level-up refuses it: test",
      "A level before it couldn't be imported",
      "A level before it couldn't be imported",
    ]);
  });
});

describe("An import's refusals", () => {
  test("a file no importer of the ruleset reads", async () => {
    expect(await refusalOf(planImportOf("Name: Brannoc\nRace: Human"))).toEqual({
      message: "No importer reads this file: this ruleset imports files from PCGen",
      refusal: "unprocessable",
    });
  });

  test("a PCGen character of another game mode", async () => {
    const text = (await readPcgenFile("brannoc")).replace("GAMEMODE:35e", "GAMEMODE:Pathfinder_RPG");
    expect(await refusalOf(planImportOf(text))).toEqual({
      message: "This file is a character of PCGen's Pathfinder_RPG game mode: this ruleset imports 3.5 characters",
      refusal: "unprocessable",
    });
  });

  test("a PCGen format no reader reads yet", async () => {
    const text = (await readPcgenFile("brannoc")).replace("PCGVERSION:2.0", "PCGVERSION:3.0");
    expect(await refusalOf(planImportOf(text))).toEqual({
      message: "PCGen's character file format 3.0 isn't read yet",
      refusal: "unprocessable",
    });
  });

  test("a race the ruleset hasn't: a character needs one", async () => {
    const text = (await readPcgenFile("brannoc")).replace("RACE:Human", "RACE:Warforged");
    expect(await refusalOf(planImportOf(text))).toEqual({
      message: "The file's race (Warforged) isn't in this ruleset",
      refusal: "unprocessable",
    });
  });
});
