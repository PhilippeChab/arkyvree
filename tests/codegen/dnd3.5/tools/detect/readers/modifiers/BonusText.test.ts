import { describe, expect, test } from "bun:test";

import { BonusText } from "@/codegen/dnd3.5/tools/detect/readers/modifiers/BonusText.ts";

/** The skill bonuses a text gives, each as "slug +value", or "?name" for a name that isn't a skill. */
function bonuses(text: string) {
  return new BonusText(text).skillBonuses().map(({ slug, name, value }) => (slug ? `${slug} +${value}` : `?${name}`));
}

/** Whether the first bonus ("+N … checks") in `text` applies only sometimes. */
function conditional(text: string) {
  return conditionalAt(text, /\+.*? checks/);
}

/** Whether the bonus `pattern` reads in `text` applies only sometimes: the text gives it but not as a standing one. */
function conditionalAt(text: string, pattern: RegExp) {
  if (!pattern.test(text)) throw new Error(`${pattern} reads nothing in "${text}"`);
  return new BonusText(text).first(pattern) === undefined;
}

describe("A text's skill bonuses", () => {
  test("are read from a list, a check after another, with any bonus type and possessive", () => {
    expect(
      bonuses("You gain a +4 bonus on Bluff, Diplomacy, Gather Information, Intimidate, and Perform checks."),
    ).toEqual(["bluff +4", "diplomacy +4", "gatherinformation +4", "intimidate +4", "perform +4"]);
    expect(bonuses("He gains a +2 competence bonus on Gather Information and Knowledge (local) checks.")).toEqual([
      "gatherinformation +2",
      "knowledgelocal +2",
    ]);
    expect(bonuses("It grants a +10 competence bonus on its wearer's Climb checks.")).toEqual(["climb +10"]);
    expect(bonuses("You get a +2 bonus on all Swim checks and Climb checks.")).toEqual(["swim +2", "climb +2"]);
    expect(bonuses("You gain a +4 bonus on your Jump check.")).toEqual(["jump +4"]);
  });

  test("keep a skill whose name holds an 'and', and report a name that isn't a skill", () => {
    expect(bonuses("+2 bonus on Knowledge (architecture and engineering) checks")).toEqual([
      "knowledgearchitectureandengineering +2",
    ]);
    expect(bonuses("The wearer gains a +2 competence bonus on all Charisma checks.")).toEqual(["?Charisma"]);
  });

  test("leave out a size bonus, initiative, and text that only reads like a list", () => {
    expect(bonuses("A gnome gains a +1 size bonus to Armor Class and a +4 size bonus on Hide checks.")).toEqual([]);
    expect(bonuses("You get a +2 bonus on initiative checks.")).toEqual([]);
    expect(bonuses("It grants a +8 racial bonus on Climb checks and allows you to take 10 on Climb checks.")).toEqual([
      "climb +8",
    ]);
    expect(bonuses("In addition to granting a +2 enhancement bonus to AC, it has a -1 armor check penalty.")).toEqual(
      [],
    );
  });
});

describe("A bonus", () => {
  test("applies only sometimes under a condition, an effect used, or a narrowing", () => {
    expect(conditional("If you make a jump after a running start, you gain a +4 bonus on your Jump checks.")).toBe(
      true,
    );
    expect(
      conditional("As long as she remains within 5 feet of the wall, she receives a +10 bonus on Hide checks."),
    ).toBe(true);
    expect(conditional("You can expend one use of wild shape to gain a +8 bonus on Spot checks for 1 hour.")).toBe(
      true,
    );
    expect(conditional("A drinker gains an ability to hide (+10 competence bonus on Hide checks for 1 hour).")).toBe(
      true,
    );
    expect(conditional("You gain a +4 bonus on Bluff checks made for this purpose.")).toBe(true);
    expect(conditional("You can spend a use of rage to gain a +4 bonus on Jump checks.")).toBe(true);
    expect(
      conditional("Three times per day, you can use an immediate action to gain a +5 bonus on Climb checks."),
    ).toBe(true);
  });

  test("falls under its own part of a sentence, and what joins it to another bonus", () => {
    const both = "You gain a +2 bonus on Fortitude saves against poison, and a +1 bonus on Will saves.";
    expect(conditionalAt(both, /\+2 bonus on Fortitude saves/)).toBe(true);
    expect(conditionalAt(both, /\+1 bonus on Will saves/)).toBe(false);
    const either =
      "An honorable pirate gains a +2 bonus on Diplomacy checks, while a dishonorable one gains a +2 bonus on Intimidate checks.";
    expect(conditionalAt(either, /\+2 bonus on Diplomacy checks/)).toBe(true);
    expect(conditionalAt(either, /\+2 bonus on Intimidate checks/)).toBe(true);
  });

  test("isn't the character's when it goes to someone else", () => {
    expect(conditional("All allies within 30 feet gain a +2 competence bonus on Spot checks.")).toBe(true);
    expect(conditional("Her mount gains a +2 bonus on Jump checks.")).toBe(true);
  });

  test("applies always when only what's worn, held or carried, the level it comes at, or another sentence, sets terms", () => {
    expect(conditional("The wearer gains a +5 competence bonus on Climb checks when worn.")).toBe(false);
    expect(
      conditional("If you are wearing light armor and carrying a light load, you gain a +2 bonus on Jump checks."),
    ).toBe(false);
    expect(conditional("You gain a +2 racial bonus on Listen checks. You hide only when unseen.")).toBe(false);
    // A class feature's level is when it's granted, not a condition; one named after it still is
    expect(
      conditionalAt("When she attains 6th level, a dervish gains a +2 bonus on initiative rolls.", /\+2 bonus/),
    ).toBe(false);
    expect(conditional("Upon reaching 9th level, a scout gains a +2 bonus on Hide checks.")).toBe(false);
    expect(
      conditionalAt(
        "When she attains 7th level, a dervish gains an extra +4 bonus to Armor Class when she chooses to fight defensively.",
        /\+4 bonus/,
      ),
    ).toBe(true);
    // "for" scales it here, it doesn't narrow it
    expect(conditional("You gain a +1 bonus on Search checks for every three class levels.")).toBe(false);
    // A race's traits are joined by a separator: each is its own sentence
    expect(conditional("+2 racial bonus on Listen checks.\u2063Proficient with longswords only when trained.")).toBe(
      false,
    );
  });
});
