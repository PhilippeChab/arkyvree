import { describe, expect, test } from "bun:test";

import { BenefitModifiers } from "@/codegen/dnd3.5/tools/detect/readers/modifiers/BenefitModifiers.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";

describe("A 3.5 benefit's natural armor", () => {
  test("is the character's own bonus", () => {
    // Geomancer's Bark Skin drift
    const barkSkin = "The geomancer's skin turns to tree bark: he gains a +1 natural armor bonus to AC.";
    expect(new BenefitModifiers(barkSkin).modifiers).toEqual([bonus("combat.ac.natural", 1)]);
  });

  test("isn't a mount's, which an example gives", () => {
    // Devoted Tracker's example: its paladin/ranger's special mount, not the character
    const devotedTracker =
      "If you have both the special mount and animal companion class features, you can designate your special mount as your animal companion. For instance, a 5th-level paladin/6th-level ranger's special mount would have 4 bonus Hit Dice, a +6 natural armor adjustment, +2 Strength, +1 Dexterity, two bonus tricks, and Intelligence 6.";
    expect(new BenefitModifiers(devotedTracker).modifiers).toEqual([]);
  });
});
