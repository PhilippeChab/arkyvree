import { describe, expect, test } from "bun:test";

import { BenefitModifiers } from "@/codegen/pf1/tools/detect/feats/BenefitModifiers.ts";
import { OPTION } from "@/codegen/pf1/tools/terms/featOptions.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import { gte } from "@/content/core/builders/customization/requirements.ts";

describe("A feat's benefit", () => {
  test("gives the plain bonuses on saves, initiative and dodge AC", () => {
    expect(new BenefitModifiers("You get a +2 bonus on all Will saving throws.").modifiers).toEqual([
      bonus("saves.will.misc", 2),
    ]);
    expect(new BenefitModifiers("You get a +4 bonus on initiative checks.").modifiers).toEqual([
      bonus("combat.initiative.misc", 4),
    ]);
    expect(
      new BenefitModifiers(
        "You gain a +1 dodge bonus to your AC. A condition that makes you lose your Dex bonus to AC also makes you lose the benefits of this feat.",
      ).modifiers,
    ).toEqual([bonus("combat.ac.dodge", 1)]);
  });

  test("gives two skills' bonus, more from 10 ranks in each", () => {
    const alertness = new BenefitModifiers(
      "You get a +2 bonus on all Heal checks and Survival checks. If you have 10 or more ranks in one of these skills, the bonus increases to +4 for that skill.",
    );
    expect(alertness.modifiers).toEqual([
      bonus("skills.heal.misc", 2),
      { ...bonus("skills.heal.misc", 2), requirements: [gte("skills.heal.rank", 10)] },
      bonus("skills.survival.misc", 2),
      { ...bonus("skills.survival.misc", 2), requirements: [gte("skills.survival.rank", 10)] },
    ]);
  });

  test("gives Skill Focus's +3 on the option's checks, +6 from 10 ranks", () => {
    const skillFocus = new BenefitModifiers(
      "You get a +3 bonus on all checks involving the chosen skill. If you have 10 or more ranks in that skill, this bonus increases to +6.",
    );
    expect(skillFocus.modifiers).toEqual([
      bonus(`skills.${OPTION}.misc`, 3),
      { ...bonus(`skills.${OPTION}.misc`, 3), requirements: [gte(`skills.${OPTION}.rank`, 10)] },
    ]);
  });

  test("gives Toughness's hit points, one more per hit die past 3", () => {
    const toughness = new BenefitModifiers(
      "You gain +3 hit points. For every Hit Die you possess beyond 3, you gain an additional +1 hit point. If you have more than 3 Hit Dice, you gain +1 hit points whenever you gain a Hit Die (such as when you gain a level).",
    );
    expect(toughness.modifiers).toEqual([
      bonus("combat.hp.misc", 3),
      { ...bonus("combat.hp.misc", "{{ [identity.meta.level] - 3 }}"), requirements: [gte("identity.meta.level", 4)] },
    ]);
  });

  test("gives a weapon family's bonuses on the option's weapon", () => {
    expect(
      new BenefitModifiers("You gain a +2 bonus on all damage rolls you make using the selected weapon.").modifiers,
    ).toEqual([bonus(`items.weapons.${OPTION}.damage.misc`, 2)]);
    expect(new BenefitModifiers("When using the weapon you selected, your threat range is doubled.").modifiers).toEqual(
      [
        {
          target: `items.weapons.${OPTION}.damage.critical.range`,
          operator: "multiply",
          value: "2",
          valueType: "number",
        },
      ],
    );
  });

  test("leaves a bonus that applies only sometimes to review", () => {
    const greaterTrip = new BenefitModifiers(
      "You receive a +2 bonus on checks made to trip a foe. This bonus stacks with the bonus granted by Improved Trip.",
    );
    expect(greaterTrip.modifiers).toEqual([]);
    expect(greaterTrip.unresolved).toEqual(["You receive a +2 bonus on checks made to trip a foe."]);
    const fleet = new BenefitModifiers(
      "While you are wearing light or no armor, your base speed increases by 5 feet. You lose the benefits of this feat if you carry a medium or heavy load.",
    );
    expect(fleet.unresolved).toEqual(["While you are wearing light or no armor, your base speed increases by 5 feet."]);
  });
});
