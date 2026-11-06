import { describe, expect, test } from "bun:test";

import { ClassFeatures } from "@/codegen/pf1/tools/detect/classes/ClassFeatures.ts";

/** The features a page's features and its Special column make, each by its name and levels. */
function levelsOf(features: { label: string; text: string }[], specials: string[][]) {
  return new ClassFeatures({ features }, specials).all().map(({ levels, name }) => [name, levels]);
}

describe("A class's features", () => {
  test("are gained at the levels its table's entries name them, plural, ranked or numbered", () => {
    const features = [
      { label: "Bonus Feats", text: "A fighter gains a bonus feat." },
      { label: "Bravery (Ex)", text: "Starting at 2nd level, a fighter gains a +1 bonus on Will saves against fear." },
      { label: "Damage Reduction (Ex)", text: "At 7th level, a barbarian gains damage reduction." },
    ];
    expect(levelsOf(features, [["Bonus feat"], ["Bonus feat", "bravery +1"], ["Damage reduction 1/-"]])).toEqual([
      ["Bonus Feats", [1, 2]],
      ["Bravery", [2]],
      ["Damage Reduction", [3]],
    ]);
  });

  test("are gained at the level their text opens on when the table names none, else the first", () => {
    const features = [
      {
        label: "Spells",
        text: "Beginning at 4th level, a paladin gains the ability to cast a small number of spells.",
      },
      { label: "Weapon and Armor Proficiency", text: "Paladins are proficient with all simple weapons." },
    ];
    expect(levelsOf(features, [[]])).toEqual([
      ["Spells", [4]],
      ["Weapon and Armor Proficiency", [1]],
    ]);
  });

  test("make a sub-ability their text heads a feature of its own, its text up to the next heading", () => {
    const features = [
      {
        label: "Bardic Performance",
        text: "A bard performs. Countersong (Su): At 1st level, a bard counters. Fascinate (Su): At 1st level, a bard fascinates.",
      },
    ];
    const read = new ClassFeatures({ features }, [["countersong", "fascinate"]]);
    expect(read.all().map(({ name, text }) => [name, text])).toEqual([
      ["Bardic Performance", "A bard performs."],
      ["Countersong", "At 1st level, a bard counters."],
      ["Fascinate", "At 1st level, a bard fascinates."],
    ]);
  });

  test("leave unread an entry naming no feature", () => {
    expect(new ClassFeatures({ features: [] }, [["Mystery"]]).unread()).toEqual(["Mystery (level 1)"]);
  });
});
