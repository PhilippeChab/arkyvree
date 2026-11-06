import { describe, expect, test } from "bun:test";

import { SpellDetector } from "@/codegen/pf1/tools/detect/spells/SpellDetector.ts";
import type { SpellEntry } from "@/codegen/pf1/tools/types/spells.ts";
import {
  SPELL_AREA_OF_EFFECT,
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_DURATION,
  SPELL_EFFECT,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SCHOOL,
  SPELL_SUBSCHOOL,
  SPELL_TARGET,
} from "@/vocabulary/pf1/fields/index.ts";

const ACID_ARROW: SpellEntry = {
  name: "Acid Arrow",
  fields: {
    "Casting Time": "1 standard action",
    Components: "V, S, M (rhubarb leaf and an adder's stomach), F (a dart)",
    Duration: "1 round + 1 round per three levels",
    Effect: "one arrow of acid",
    Level: "arcanist 2, bloodrager 2, magus 2, sorcerer 2, wizard 2",
    Range: "long (400 ft. + 40 ft./level)",
    "Saving Throw": "none",
    School: "conjuration (creation) [acid]",
    "Spell Resistance": "no",
  },
  description: "Its text.",
  sources: [{ book: "PRPG Core Rulebook", page: 239 }],
};

/** A spell's page as read: its stat block by label, and its description. */
function spellEntry(name: string, fields: Record<string, string>, description = "Its text."): SpellEntry {
  return { name, fields, description, sources: [{ book: "PRPG Core Rulebook", page: 239 }] };
}

describe("A spell's page", () => {
  test("reads its stat block's fields, each text capitalized, a range that grows with level as its word", () => {
    expect(new SpellDetector(ACID_ARROW).fields()).toEqual({
      [SPELL_SCHOOL]: "Conjuration",
      [SPELL_SUBSCHOOL]: ["Creation"],
      [SPELL_DESCRIPTOR]: ["Acid"],
      [SPELL_COMPONENT]: ["Verbal", "Somatic", "Material", "Focus"],
      [SPELL_CASTING_TIME]: "1 standard action",
      [SPELL_RANGE_TYPE]: "Long",
      [SPELL_EFFECT]: "One arrow of acid",
      [SPELL_DURATION]: "1 round + 1 round per three levels",
      [SPELL_RESISTANCE]: "No",
    });
  });

  test("gives a spell on its caster alone no spell resistance, and its stat block's saving throw as written", () => {
    const shield = new SpellDetector(
      spellEntry("Shield", {
        "Casting Time": "1 standard action",
        Components: "V, S",
        Duration: "1 min./level (D)",
        Level: "sorcerer 1, wizard 1",
        Range: "personal",
        School: "abjuration [force]",
        Target: "you",
      }),
    );
    expect(shield.fields()).toMatchObject({ [SPELL_RANGE_TYPE]: "Personal", [SPELL_TARGET]: "You" });
    expect(shield.fields()[SPELL_RESISTANCE]).toBe("No");
    expect(shield.savingThrow()).toBe("");
    expect(new SpellDetector(ACID_ARROW).savingThrow()).toBe("none");
  });

  test("gives what a label naming two of target, effect and area holds to the first, and a plural target its own", () => {
    const fields = (label: string) =>
      new SpellDetector(
        spellEntry("Dispel Magic", { ...ACID_ARROW.fields, Effect: "", [label]: "one creature" }),
      ).fields();
    expect(fields("Target or Area")).toMatchObject({ [SPELL_TARGET]: "One creature" });
    expect(fields("Targets")).toMatchObject({ [SPELL_TARGET]: "One creature" });
    expect(fields("Area or Target")).toMatchObject({ [SPELL_AREA_OF_EFFECT]: "One creature" });
    expect(fields("Target, Effect, or Area")).toMatchObject({ [SPELL_TARGET]: "One creature" });
  });

  test("reads its levels on the Core Rulebook's lists, and names the classes it leaves out", () => {
    const arrow = new SpellDetector(ACID_ARROW);
    expect(arrow.aptitudeLevels()).toEqual({ "Sorcerer Spells": 2, "Wizard Spells": 2 });
    expect(arrow.otherClasses()).toEqual(["arcanist", "bloodrager", "magus"]);
    expect(arrow.unread()).toEqual([]);
  });

  test("describes it with its text, then what its material component and focus are", () => {
    expect(new SpellDetector(ACID_ARROW).description()).toBe(
      "Its text. Material Component: Rhubarb leaf and an adder's stomach. Focus: A dart.",
    );
  });

  test("leaves out of its text what the site adds, and parts the page joins with no space a sentence's apart", () => {
    const summon = spellEntry(
      "Summon Monster 1",
      { ...ACID_ARROW.fields, Components: "V, S" },
      "Note: Antipaladins may only summon evil creatures. It summons a creature. Nethys Note: according to the " +
        "Monster Summoner's Handbook pg. 18, it can summon others 1st LevelSubtypeDire rat",
    );
    expect(new SpellDetector(summon).description()).toBe("It summons a creature. 1st LevelSubtypeDire rat");
    const augury = spellEntry("Augury", { ...ACID_ARROW.fields, Components: "V, S" }, "Weal (good).Woe (bad).");
    expect(new SpellDetector(augury).description()).toBe("Weal (good). Woe (bad).");
  });

  test("is named as its book prints it, a numeral the site writes as a digit in its book's numerals", () => {
    expect(new SpellDetector(spellEntry("Summon Monster 1", ACID_ARROW.fields)).name()).toBe("Summon Monster I");
    expect(new SpellDetector(spellEntry("Summon Nature's Ally 9", ACID_ARROW.fields)).name()).toBe(
      "Summon Nature's Ally IX",
    );
    expect(new SpellDetector(ACID_ARROW).name()).toBe("Acid Arrow");
  });

  test("lists what no reading takes: a label it doesn't know, and its lines' unread values", () => {
    const odd = new SpellDetector(
      spellEntry("Odd", { ...ACID_ARROW.fields, Bloodline: "draconic", School: "evocation [pain, time]" }),
    );
    expect(odd.unread()).toEqual(['label "Bloodline"', 'descriptor "Time"']);
    expect(odd.leftOutDescriptors()).toEqual(["pain"]);
  });
});
