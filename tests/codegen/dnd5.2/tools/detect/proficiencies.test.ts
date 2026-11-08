import { describe, expect, test } from "bun:test";

import {
  readAbility,
  readChoiceOptions,
  readProficiencyFeats,
  readSkill,
  readTool,
} from "@/codegen/dnd5.2/tools/detect/proficiencies.ts";
import type { Choice } from "@/codegen/dnd5.2/tools/types/common.ts";

/** The tools a test's book has. */
const TOOLS = ["Herbalism Kit", "Lute", "Thieves' Tools"];

/** A choice of `choose` among options, each an item of a name, or a nested choice of such items. */
function choiceOf(choose: number, options: (string | string[])[]): Choice {
  const item = (name: string) => ({ option_type: "reference", item: { index: name.toLowerCase(), name } });
  return {
    choose,
    type: "proficiencies",
    from: {
      option_set_type: "options_array",
      options: options.map((option) =>
        Array.isArray(option)
          ? { option_type: "choice", choice: { choose: 1, type: "proficiencies", from: { options: option.map(item) } } }
          : item(option),
      ),
    },
  };
}

describe("An ability the database abbreviates", () => {
  test("is its name, whatever its case", () => {
    expect(readAbility("STR")).toBe("Strength");
    expect(readAbility("cha")).toBe("Charisma");
  });

  test("throws when it's none", () => {
    expect(() => readAbility("LUK")).toThrow('"LUK" names no ability');
  });
});

describe("A choice's options", () => {
  test("are its items' names, its nested choices' among them", () => {
    expect(readChoiceOptions(choiceOf(1, ["Skill: Insight", ["Lute", "Tool: Thieves' Tools"]]))).toEqual([
      "Skill: Insight",
      "Lute",
      "Tool: Thieves' Tools",
    ]);
  });
});

describe("A proficiency the database names", () => {
  test("is a saving throw's feat, by its ability", () => {
    expect(readProficiencyFeats("Saving Throw: DEX", TOOLS)).toEqual(["Saving Throw Proficiency: Dexterity"]);
  });

  test("is an armor training's feat, all armor's three", () => {
    expect(readProficiencyFeats("Medium Armor", TOOLS)).toEqual(["Armor Training: Medium Armor"]);
    expect(readProficiencyFeats("Shields", TOOLS)).toEqual(["Armor Training: Shields"]);
    expect(readProficiencyFeats("All armor", TOOLS)).toEqual([
      "Armor Training: Light Armor",
      "Armor Training: Medium Armor",
      "Armor Training: Heavy Armor",
    ]);
  });

  test("is a category of weapons' feat, or a weapon's, named in the plural", () => {
    expect(readProficiencyFeats("Martial Weapons", TOOLS)).toEqual(["Weapon Proficiency: Martial Weapons"]);
    expect(readProficiencyFeats("Hand crossbows", TOOLS)).toEqual(["Weapon Proficiency: Hand Crossbow"]);
  });

  test("is a skill's feat, or a tool's, with or without its prefix", () => {
    expect(readProficiencyFeats("Skill: Sleight of Hand", TOOLS)).toEqual(["Skill Proficiency: Sleight of Hand"]);
    expect(readProficiencyFeats("Tool: Thieves' Tools", TOOLS)).toEqual(["Tool Proficiency: Thieves' Tools"]);
    expect(readProficiencyFeats("Herbalism Kit", TOOLS)).toEqual(["Tool Proficiency: Herbalism Kit"]);
  });

  test("throws when it's none of them", () => {
    expect(() => readProficiencyFeats("Vehicles (Land)", TOOLS)).toThrow("is no proficiency the generator knows");
  });
});

describe("A skill or a tool the database names", () => {
  test("is read with or without its prefix", () => {
    expect(readSkill("Skill: Animal Handling")).toBe("Animal Handling");
    expect(readSkill("Perception")).toBe("Perception");
    expect(readTool("Tool: thieves' tools", TOOLS)).toBe("Thieves' Tools");
  });

  test("is none for another name", () => {
    expect(readSkill("Tool: Lute")).toBeUndefined();
    expect(readTool("Bagpipes", TOOLS)).toBeUndefined();
  });
});
