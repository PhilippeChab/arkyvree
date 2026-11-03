import { describe, expect, test } from "bun:test";

import { ClassPrerequisites } from "@/codegen/dnd3.5/tools/detect/readers/requirements/ClassPrerequisites.ts";
import { FeatPrerequisites } from "@/codegen/dnd3.5/tools/detect/readers/requirements/FeatPrerequisites.ts";
import { eq, gte, or } from "@/content/core/builders/customization/requirements.ts";
import { feat } from "@/content/dnd3.5/builders/feats/possession.ts";

/** The requirements a class whose special prerequisite is `text` gives. */
function classRequirements(text: string) {
  return new ClassPrerequisites({ special: [text] }).requirements;
}

/** The requirements a feat whose prerequisite text is `text` gives. */
function featRequirements(text: string) {
  return new FeatPrerequisites({ name: "Feat", featType: "general", prerequisiteText: text, benefit: "", special: "" })
    .requirements;
}

describe("A class feature a prerequisite names", () => {
  test.each([
    [
      "Ability to turn or rebuke undead,",
      "Ability to turn or rebuke undead.",
      eq("feats.turnorrebukeundead.*.possessed"),
    ],
    ["Ability to turn undead,", "Able to turn undead.", eq("feats.turnorrebukeundead.*.possessed")],
    ["Turn or rebuke undead ability,", "Turn undead class feature.", eq("feats.turnorrebukeundead.*.possessed")],
    ["Ability to wild shape,", "Wild shape ability", eq("feats.wildshape.*.possessed")],
    ["Flurry of blows ability,", "Flurry of blows ability", eq("feats.flurryofblows.*.possessed")],
    ["Sneak attack +2d6,", "Sneak attack +2d6.", gte("feats.sneakattack.count", 2)],
  ])("is any class's feature of its family: a feat's %p as a class's %p", (featText, classText, requirement) => {
    expect(featRequirements(featText)).toEqual([requirement]);
    expect(classRequirements(classText)).toEqual([requirement]);
  });

  test("of rage or frenzy is any class's rage, or the frenzied berserker's frenzy, which is no rage", () => {
    const rageOrFrenzy = or(eq("feats.rage.*.possessed"), eq(feat("Frenzy (Frenzied Berserker)")));
    expect(featRequirements("Rage or frenzy ability,")).toEqual([rageOrFrenzy]);
    expect(classRequirements("Rage or frenzy ability.")).toEqual([rageOrFrenzy]);
  });

  test("of a smite is any class's smite of whatever kind, or the Destruction domain's; of smite evil, smite evil", () => {
    expect(featRequirements("CHA 13, smite ability,")).toEqual([
      gte("abilities.charisma.total", 13),
      or(eq("feats.smite.*.possessed"), eq(feat("Destruction Domain"))),
    ]);
    expect(featRequirements("Track, smite evil,")).toEqual([eq(feat("Track")), eq("feats.smiteevil.*.possessed")]);
  });
});
