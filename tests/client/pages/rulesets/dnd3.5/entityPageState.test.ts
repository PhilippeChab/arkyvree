import { describe, expect, test } from "bun:test";

import { entityPageBack } from "@/client/src/pages/rulesets/entityPageState.ts";
import { Engine } from "@/engine/index.ts";

/** A 3.5 ruleset's words, as the engine describes them to the client. */
const DND35_WORDS = Engine.rules().describeAll()["Dungeons & Dragons: 3.5"].words;

const FALLBACK = "/rulesets/r1/skills";

describe("An entity page's way back", () => {
  test("goes to the ruleset's tab it was opened from, named for the ruleset", () => {
    expect(entityPageBack({ from: "/rulesets/r1/feats?search=dodge" }, FALLBACK)).toEqual({
      label: "Back to Ruleset",
      to: "/rulesets/r1/feats?search=dodge",
    });
    expect(entityPageBack({ from: "/rulesets/r1/classes?search=bard" }, FALLBACK)).toEqual({
      label: "Back to Ruleset",
      to: "/rulesets/r1/classes?search=bard",
    });
  });

  test("goes to the class's tab it was opened from, named for the class", () => {
    const tabbedPages = new Map([["classes", "Class"]]);
    expect(entityPageBack({ from: "/rulesets/r1/classes/c1/spells" }, FALLBACK, undefined, tabbedPages)).toEqual({
      label: "Back to Class",
      to: "/rulesets/r1/classes/c1/spells",
    });
    // An entity's page without tabs is its ruleset's list's
    expect(entityPageBack({ from: "/rulesets/r1/languages/l1" }, FALLBACK, undefined, tabbedPages).label).toBe(
      "Back to Ruleset",
    );
  });

  test("goes to the customization tab it was opened from, named for its entity in its ruleset's words", () => {
    expect(entityPageBack({ from: "/rulesets/r1/feats/f1/customization/modifiers" }, FALLBACK, DND35_WORDS)).toEqual({
      label: "Back to Feat",
      to: "/rulesets/r1/feats/f1/customization/modifiers",
    });
    expect(entityPageBack({ from: "/rulesets/r1/spells/p1/customization" }, FALLBACK, DND35_WORDS).label).toBe(
      "Back to Spell",
    );
    expect(
      entityPageBack({ from: "/rulesets/r1/class-levels/l1/customization/requirements" }, FALLBACK, DND35_WORDS).label,
    ).toBe("Back to Class Level");
    // Before its ruleset's words are in, never its type as the code names it
    expect(entityPageBack({ from: "/rulesets/r1/class-levels/l1/customization" }, FALLBACK).label).toBe("Back");
  });

  test("goes to its fallback when it was opened from nowhere it knows", () => {
    expect(entityPageBack(undefined, FALLBACK)).toEqual({ label: "Back to Ruleset", to: FALLBACK });
    expect(entityPageBack({ from: 3 }, "/rulesets/r1/classes")).toEqual({
      label: "Back to Ruleset",
      to: "/rulesets/r1/classes",
    });
  });
});
