import { describe, expect, test } from "bun:test";

import { SpellComponents } from "@/codegen/pf1/tools/detect/spells/SpellComponents.ts";

describe("A spell's components line", () => {
  test("reads each component, a focus or divine focus both, and what its material component and focus are", () => {
    const arrow = new SpellComponents("V, S, M (rhubarb leaf and an adder's stomach), F (a dart)");
    expect(arrow.names()).toEqual(["Verbal", "Somatic", "Material", "Focus"]);
    expect(arrow.texts()).toEqual(["Material Component: Rhubarb leaf and an adder's stomach.", "Focus: A dart."]);

    const alarm = new SpellComponents("V, S, F/DF (a tiny bell and a piece of very fine silver wire)");
    expect(alarm.names()).toEqual(["Verbal", "Somatic", "Focus", "Divine Focus"]);
    expect(alarm.texts()).toEqual(["Focus: A tiny bell and a piece of very fine silver wire."]);
    expect(new SpellComponents("V, S, M/DF (a pinch of dust)").names()).toEqual([
      "Verbal",
      "Somatic",
      "Material",
      "Divine Focus",
    ]);
  });

  test("splits at commas outside parentheses, and leaves out a pointer to its text and a verbal component's words", () => {
    const lightning = new SpellComponents(
      "V, S, F (a bit of fur, a piece of amber, glass, or a crystal rod; plus one silver pin per caster level)",
    );
    expect(lightning.names()).toEqual(["Verbal", "Somatic", "Focus"]);
    expect(lightning.texts()).toEqual([
      "Focus: A bit of fur, a piece of amber, glass, or a crystal rod; plus one silver pin per caster level.",
    ]);

    const pattern = new SpellComponents("V (bard only), S, M (a stick of incense or a crystal rod); see text");
    expect(pattern.names()).toEqual(["Verbal", "Somatic", "Material"]);
    expect(pattern.texts()).toEqual(["Material Component: A stick of incense or a crystal rod."]);
    expect(pattern.unread()).toEqual([]);
    expect(new SpellComponents("V, S, M (see text)").texts()).toEqual([]);
  });

  test("lists what it can't read", () => {
    const odd = new SpellComponents("V, XP (100 gp), S; a sprig of holly");
    expect(odd.names()).toEqual(["Verbal", "Somatic"]);
    expect(odd.unread()).toEqual(['component "XP (100 gp)"', 'component "a sprig of holly"']);
  });
});
