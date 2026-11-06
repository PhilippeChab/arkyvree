import { describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { domainFeat } from "@/content/pf1/builders/aptitudes/names.ts";
import { ALL_CLASSES } from "@/content/pf1/generated/core-rulebook/classes/index.ts";
import { ALL_RACES } from "@/content/pf1/generated/core-rulebook/races.ts";
import { ALL_SPELLS } from "@/content/pf1/generated/core-rulebook/spells/index.ts";
import { CORE, TEMPLATE_ITEMS } from "@/content/pf1/packages/core.ts";
import { PF1_RULESET_NAME } from "@/content/pf1/rulesetNames.ts";
import { rulesetsInRules } from "@/drizzle/schema.ts";
import { RulesetViews } from "@/server/cow/index.ts";
import { db } from "@/server/database/index.ts";
import { Rulesets } from "@/server/repositories/index.ts";
import { findOtherCoreRules } from "@/tests/support/pf1/seed.ts";
import { ABILITY_NAMES } from "@/vocabulary/pf1/abilities.ts";
import { PF1_BASE_RULES } from "@/vocabulary/pf1/baseRules.ts";
import { ITEM_IS_TEMPLATE } from "@/vocabulary/pf1/fields/index.ts";
import { SKILL_NAMES } from "@/vocabulary/pf1/skills.ts";

import { seededRows } from "./seededRows.ts";

/** The 3.5 skills Pathfinder folded into others or dropped. */
const DND35_ONLY_SKILLS = ["Hide", "Move Silently", "Spot", "Listen", "Jump", "Tumble", "Balance", "Speak Language"];

/** A modifier as its target, operator and value read. */
function describeModifier({ operator, target, value }: { operator: string; target: string; value: string }) {
  return `${target} ${operator} ${value}`;
}

/** The base bonus each of a class's levels 1 to 3 gives each save, by the save's name: what its table reads. */
function saveBonuses(rows: Awaited<ReturnType<typeof seededRows>>, klass: string) {
  const saveNames = new Map(rows.saves.map(({ id, name }) => [id, name]));
  return Object.fromEntries(
    rows.saves.map(({ name }) => [
      name,
      [1, 2, 3].map((level) => {
        const { id } = rows.classLevel(klass, level);
        const link = rows.baseBonusLinks.find(({ fromId, toId }) => fromId === id && saveNames.get(toId) === name);
        return link?.amount ?? 0;
      }),
    ]),
  );
}

/** A list of rows' names, sorted. */
function sortedNames(rows: { name: string }[]) {
  return rows.map(({ name }) => name).sort();
}

describe("The seeded Pathfinder core rules", () => {
  test("are a base ruleset, Core PSD 1, of the Pathfinder base rules: a published, playable system ruleset", async () => {
    const [ruleset] = await db.select().from(rulesetsInRules).where(eq(rulesetsInRules.name, PF1_RULESET_NAME));
    expect(ruleset).toMatchObject({
      baseRules: PF1_BASE_RULES,
      kind: "ruleset",
      rulesetId: null,
      status: "Published",
      system: true,
      userId: null,
    });
    // The Pathfinder package seeds no extension: its base rules' only system ruleset
    const systemPathfinder = (await Rulesets.findMany(db, { system: true })).filter(
      ({ baseRules }) => baseRules === PF1_BASE_RULES,
    );
    expect(systemPathfinder.map(({ name }) => name)).toEqual([PF1_RULESET_NAME]);
  });

  describe("hold the core package's content, kind by kind", () => {
    test("its 7 races, and its bonded creatures' races", async () => {
      const rows = await seededRows();
      expect(sortedNames(rows.races)).toEqual(sortedNames([...ALL_RACES, ...CORE.bonds.flatMap(({ races }) => races)]));
      expect(sortedNames(rows.races.filter(({ partition }) => partition === "pc"))).toEqual([
        "Dwarf",
        "Elf",
        "Gnome",
        "Half-Elf",
        "Half-Orc",
        "Halfling",
        "Human",
      ]);
    });

    test("its 26 classes, base, prestige and NPC, and its bonded creatures' classes, with their levels", async () => {
      const rows = await seededRows();
      expect(sortedNames(rows.classes)).toEqual(sortedNames([...ALL_CLASSES, ...CORE.bonds.map(({ klass }) => klass)]));
      expect(rows.classes.filter(({ partition }) => partition === "pc")).toHaveLength(26);
      const levelCounts = new Set(
        rows.classes.map(({ id }) => rows.classLevels.filter(({ ownerId }) => ownerId === id).length),
      );
      // The prestige classes have 10 levels, the others 20
      expect([...levelCounts].sort()).toEqual([10, 20]);
    });

    test("its feats: the book's, the hand-written ones, a feat a cleric domain, and the bonded creatures'", async () => {
      const rows = await seededRows();
      expect(sortedNames(rows.feats)).toEqual(
        [
          ...CORE.feats.map(({ name }) => name),
          ...CORE.domains.map(({ name }) => domainFeat(name)),
          ...CORE.bonds.flatMap(({ feats }) => feats.map(({ name }) => name)),
        ].sort(),
      );
    });

    test("its 623 spells", async () => {
      const rows = await seededRows();
      expect(rows.spells).toHaveLength(623);
      expect(sortedNames(rows.spells)).toEqual(sortedNames(ALL_SPELLS));
    });

    test("its items, the weapons, armor and shields among them its templates", async () => {
      const rows = await seededRows();
      expect(sortedNames(rows.items)).toEqual(sortedNames([...TEMPLATE_ITEMS, ...CORE.items]));
      expect(sortedNames(rows.items.filter(({ fields }) => fields[ITEM_IS_TEMPLATE]))).toEqual(
        sortedNames(TEMPLATE_ITEMS),
      );
    });

    test("its abilities, saves, languages and 35 skills", async () => {
      const rows = await seededRows();
      expect(sortedNames(rows.abilities)).toEqual([...ABILITY_NAMES].sort());
      expect(sortedNames(rows.saves)).toEqual(["Fortitude", "Reflex", "Will"]);
      expect(sortedNames(rows.languages)).toEqual(sortedNames(CORE.languages));
      expect(sortedNames(rows.skills)).toEqual([...SKILL_NAMES].sort());
    });

    test("its feat pools and spell lists: the book's, a human's racial ability pick and a wizard's schools", async () => {
      const names = sortedNames((await seededRows()).aptitudes);
      expect(names).toEqual(expect.arrayContaining([...CORE.aptitudes].sort()));
      expect(names).toEqual(
        expect.arrayContaining(["Arcane School", "Opposition School", "Racial Ability Score", "Wizard Spells"]),
      );
    });
  });

  describe("are Pathfinder's alone", () => {
    test("name none of 3.5's skills", async () => {
      const skills = sortedNames((await seededRows()).skills);
      expect(skills.filter((name) => DND35_ONLY_SKILLS.includes(name))).toEqual([]);
    });

    test("link, customize and list only their own rows", async () => {
      const rows = await seededRows();
      const ownIds = new Set(Object.values(rows.raw.entities).flatMap((entities) => entities.map(({ id }) => id)));
      const foreign = [
        ...[...rows.raw.links.values()].flatMap(({ links }) => links.map(({ toId }) => toId)),
        ...rows.raw.modifiers.map(({ sourceId }) => sourceId),
        ...rows.raw.requirements.filter(({ entityType }) => entityType !== "modifiers").map(({ entityId }) => entityId),
      ].filter((id) => !ownIds.has(id));
      expect(foreign).toEqual([]);
    });

    test("share no row with 3.5's core rules, whose skills, pools and feats stay 3.5's", async () => {
      const pathfinder = await seededRows();
      const { ruleset: dnd35 } = await findOtherCoreRules();
      const raw = await RulesetViews.getRawData(dnd35.id);
      const dnd35Ids = new Set(Object.values(raw.entities).flatMap((entities) => entities.map(({ id }) => id)));
      expect(
        Object.values(pathfinder.raw.entities).flatMap((entities) => entities.filter(({ id }) => dnd35Ids.has(id))),
      ).toEqual([]);
      const named = (type: string) => (raw.entities[type] ?? []).map(({ name }) => name);
      expect(named("skills")).not.toContain("Perception");
      expect(named("skills")).not.toContain("Acrobatics");
      expect(named("aptitudes")).not.toContain("Racial Ability Score");
      expect(named("feats").filter((name) => name.startsWith("Racial Ability Score"))).toEqual([]);
    });
  });

  describe("hold the Core Rulebook's rules", () => {
    test("give a human a racial ability pick, a bonus feat and a skill rank a level", async () => {
      const rows = await seededRows();
      const modifiers = rows.modifiersOf(rows.pcRace("Human").id).map(describeModifier);
      expect(modifiers).toEqual(
        expect.arrayContaining([
          "aptitudes.racialabilityscore.allowed add 1",
          "aptitudes.general.allowed add 1",
          "skills.budget.perlevel add 1",
        ]),
      );
      expect(modifiers.filter((m) => m.startsWith("abilities."))).toEqual([]);
    });

    test("give a dwarf +2 Constitution, +2 Wisdom and −2 Charisma", async () => {
      const rows = await seededRows();
      expect(
        rows
          .modifiersOf(rows.pcRace("Dwarf").id)
          .map(describeModifier)
          .filter((m) => m.startsWith("abilities."))
          .sort(),
      ).toEqual(["abilities.charisma.misc add -2", "abilities.constitution.misc add 2", "abilities.wisdom.misc add 2"]);
    });

    test("make each racial ability score feat +2 to its ability, picked in the Racial Ability Score pool", async () => {
      const rows = await seededRows();
      const pool = rows.aptitudes.find(({ name }) => name === "Racial Ability Score")!;
      const listed = rows.raw.links;
      for (const ability of ABILITY_NAMES) {
        const feat = rows.feat(`Racial Ability Score: ${ability}`);
        expect({ ability, modifiers: rows.modifiersOf(feat.id).map(describeModifier) }).toEqual({
          ability,
          modifiers: [`abilities.${ability.toLowerCase()}.misc add 2`],
        });
        const pools = (listed.get(feat.id)?.links ?? []).filter(({ role }) => role === "listedIn");
        expect(pools.map(({ toId }) => toId)).toEqual([pool.id]);
      }
    });

    test("give a base class's good save +2 at its 1st level, and a poor one +0: the fighter's", async () => {
      // Good: 2 + level / 2; poor: level / 3, rounded down
      expect(saveBonuses(await seededRows(), "Fighter")).toEqual({
        Fortitude: [2, 3, 3],
        Reflex: [0, 0, 1],
        Will: [0, 0, 1],
      });
    });

    test("give a prestige class's good save +1 at its 1st level, and a poor one +0: the duelist's and the arcane archer's", async () => {
      // Good: (level + 1) / 2; poor: (level + 1) / 3, rounded down
      const rows = await seededRows();
      expect(saveBonuses(rows, "Duelist")).toEqual({ Fortitude: [0, 1, 1], Reflex: [1, 1, 2], Will: [0, 1, 1] });
      expect(saveBonuses(rows, "Arcane Archer")).toEqual({ Fortitude: [1, 1, 2], Reflex: [1, 1, 2], Will: [0, 1, 1] });
    });
  });
});
