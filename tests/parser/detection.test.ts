import { describe, expect, test } from "bun:test";

import { ALL_FEATS as ADVENTURER_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-adventurer/feats/index.ts";
import { ALL_FEATS as ARCANE_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-arcane/feats/index.ts";
import { ALL_FEATS as DIVINE_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-divine/feats/index.ts";
import { ALL_FEATS as SCOUNDREL_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-scoundrel/feats/index.ts";
import { ALL_FEATS as WARRIOR_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-warrior/feats/index.ts";
import { RODS, WONDROUS_ITEMS } from "@/database/packages/dnd35-from-parser/generated/srd/items/index.ts";
import { ALL_RACES } from "@/database/packages/dnd35-from-parser/generated/srd/races/data.ts";
import { readArmorStats } from "@/database/packages/dnd35-from-parser/tools/scraper/armorStats.ts";
import { isConditional } from "@/database/packages/dnd35-from-parser/tools/scraper/conditional.ts";
import { readSkillBonuses } from "@/database/packages/dnd35-from-parser/tools/scraper/skillBonuses.ts";
import { readWeaponEnhancement } from "@/database/packages/dnd35-from-parser/tools/scraper/weaponStats.ts";

/** The skill bonuses a text gives, each as "slug +value", or "?name" for a name that isn't a skill. */
function bonuses(text: string) {
  return readSkillBonuses(text, () => false).map(({ slug, name, value }) => (slug ? `${slug} +${value}` : `?${name}`));
}

/** Whether the first bonus ("+N …") in `text` applies only sometimes. */
function conditional(text: string) {
  const start = text.indexOf("+");
  const end = text.indexOf(" checks", start) + " checks".length;
  return isConditional(text, start, end);
}

/** The modifiers seeded with the entity named `name` of `seeds`, each as "target +value". */
function seededModifiers(seeds: { name: string; modifiers?: { target: string; value: string }[] }[], name: string) {
  const seed = seeds.find((entry) => entry.name === name);
  if (!seed) throw new Error(`${name} isn't seeded`);
  return (seed.modifiers ?? []).map(({ target, value }) => `${target} +${value}`).sort();
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
    expect(isConditional(both, both.indexOf("+2"), both.indexOf(" against"))).toBe(true);
    expect(isConditional(both, both.indexOf("+1"), both.length - 1)).toBe(false);
    const either =
      "An honorable pirate gains a +2 bonus on Diplomacy checks, while a dishonorable one gains a +2 bonus on Intimidate checks.";
    expect(isConditional(either, either.indexOf("+2"), either.indexOf(","))).toBe(true);
    expect(isConditional(either, either.lastIndexOf("+2"), either.length - 1)).toBe(true);
  });

  test("isn't the character's when it goes to someone else", () => {
    expect(conditional("All allies within 30 feet gain a +2 competence bonus on Spot checks.")).toBe(true);
    expect(conditional("Her mount gains a +2 bonus on Jump checks.")).toBe(true);
  });

  test("applies always when only what's worn, held or carried, or another sentence, sets terms", () => {
    expect(conditional("The wearer gains a +5 competence bonus on Climb checks when worn.")).toBe(false);
    expect(
      conditional("If you are wearing light armor and carrying a light load, you gain a +2 bonus on Jump checks."),
    ).toBe(false);
    expect(conditional("You gain a +2 racial bonus on Listen checks. You hide only when unseen.")).toBe(false);
    // "for" scales it here, it doesn't narrow it
    expect(conditional("You gain a +1 bonus on Search checks for every three class levels.")).toBe(false);
    // A race's traits are joined by a separator: each is its own sentence
    expect(conditional("+2 racial bonus on Listen checks.\u0001Proficient with longswords only when trained.")).toBe(
      false,
    );
  });
});

describe("A specific armor's text", () => {
  test("gives the stats it changes, its category and weight", () => {
    expect(
      readArmorStats(
        "The armor has an arcane spell failure chance of 20%, a maximum Dexterity bonus of +4, and an armor check penalty of -2. It is considered light armor and weighs 20 pounds.",
      ),
    ).toEqual({
      properties: [
        { type: "ITEM_SPELL_FAILURE", value: "20" },
        { type: "ARMOR_MAX_DEX", value: "4" },
        { type: "ARMOR_CHECK_PENALTY", value: "-2" },
        { type: "ARMOR_PROFICIENCY", value: "Light" },
      ],
      weight: "20",
    });
    expect(
      readArmorStats("It has a 5% arcane spell failure chance and no armor check penalty. It weighs 2½ pounds."),
    ).toEqual({
      properties: [
        { type: "ITEM_SPELL_FAILURE", value: "5" },
        { type: "ARMOR_CHECK_PENALTY", value: "0" },
      ],
      weight: "2.5",
    });
  });

  test("gives its enhancement bonus, magic armor being masterwork unless its check penalty is given", () => {
    expect(readArmorStats("Ten 100-gp gems adorn this +3 banded mail.")).toEqual({
      properties: [{ type: "ITEM_MASTERWORK", value: "true" }],
      enhancement: 3,
    });
    // A bonus to something else first, and a spine's enhancement after the shield's
    expect(
      readArmorStats("This finely crafted +2 breastplate grants a +2 competence bonus on Charisma checks."),
    ).toMatchObject({ enhancement: 2 });
    expect(
      readArmorStats("This +1 heavy steel shield is covered in spines. A fired spine has a +2 enhancement bonus."),
    ).toMatchObject({ enhancement: 1 });
    expect(readArmorStats("This round heavy wooden shield has a +3 enhancement bonus.")).toMatchObject({
      enhancement: 3,
    });
    expect(readArmorStats("This +2 hide armor is made from rhinoceros hide. It has a -1 armor check penalty.")).toEqual(
      { properties: [{ type: "ARMOR_CHECK_PENALTY", value: "-1" }], enhancement: 2 },
    );
    // Adamantine armor is masterwork, magic or not; darkwood says it has no enhancement bonus
    expect(readArmorStats("This nonmagical breastplate is made of adamantine.")).toEqual({
      properties: [{ type: "ITEM_MASTERWORK", value: "true" }],
    });
    expect(readArmorStats("It has no enhancement bonus, but its construction material makes it lighter.")).toEqual({
      properties: [],
    });
  });
});

describe("A specific weapon's text", () => {
  test("gives its enhancement bonus as it first states it, a later conditional one left to its text", () => {
    const plusTwo = { attack: 2, damage: 2 };
    expect(
      readWeaponEnhancement("This +2 short sword gives its possessor a +1 luck bonus on all saving throws."),
    ).toEqual(plusTwo);
    expect(
      readWeaponEnhancement(
        "This +2 cold iron longsword becomes a +5 holy cold iron longsword in the hands of a paladin.",
      ),
    ).toEqual(plusTwo);
    expect(readWeaponEnhancement("This +1/+1 two-bladed sword has blades of alchemical silver.")).toEqual({
      attack: 1,
      damage: 1,
    });
    expect(
      readWeaponEnhancement(
        "This longsword has an enhancement bonus of +1 on the Material Plane. It operates as a +3 longsword on the Astral Plane.",
      ),
    ).toEqual({ attack: 1, damage: 1 });
  });

  test("gives a masterwork weapon's +1 on attack rolls only, and nothing for a weapon without a bonus", () => {
    expect(readWeaponEnhancement("As a masterwork weapon, it has a +1 enhancement bonus on attack rolls.")).toEqual({
      attack: 1,
      damage: 0,
    });
    expect(readWeaponEnhancement("This javelin becomes a 5d6 lightning bolt when thrown.")).toBeUndefined();
  });
});

describe("The seeded bonuses the rules read", () => {
  test("give a feat, a class feature or a race its permanent skill bonuses", () => {
    expect(seededModifiers(ADVENTURER_FEATS, "Acrobatics (Ninja)")).toEqual([
      "skills.climb.misc +2",
      "skills.jump.misc +2",
      "skills.tumble.misc +2",
    ]);
    expect(seededModifiers(ADVENTURER_FEATS, "Streetwise (Streetfighter)")).toEqual([
      "skills.gatherinformation.misc +2",
      "skills.knowledgelocal.misc +2",
    ]);
    expect(seededModifiers(DIVINE_FEATS, "Corellon's Perception (Seeker of the Misty Isle)")).toEqual([
      "skills.listen.misc +5",
      "skills.search.misc +5",
      "skills.spot.misc +5",
    ]);
    // A value that grows with level grows with the feature, which the class grants again at each step ("+10 foot…
    // increases to +20 feet")
    expect(seededModifiers(ADVENTURER_FEATS, "Fast Movement (Scout)")).toEqual([
      "combat.speed.base +{{ [feats.fastmovementscout.count] * 10 }}",
    ]);
    // A race's traits are each their own sentence
    expect(seededModifiers(ALL_RACES, "Elf")).toEqual(
      expect.arrayContaining(["skills.listen.misc +2", "skills.search.misc +2", "skills.spot.misc +2"]),
    );
  });

  test("keep what's worn, held or carried as a standing state", () => {
    // Dash's speed, for as long as the armor worn and the load carried allow it
    expect(seededModifiers(WARRIOR_FEATS, "Dash")).toEqual(["combat.speed.base +5"]);
    expect(seededModifiers(RODS, "Rod of Splendor")).toEqual(["abilities.charisma.misc +4"]);
  });

  test("leave out a bonus that's conditional, used, narrowed, someone else's or a choice", () => {
    for (const [seeds, name] of [
      [ADVENTURER_FEATS, "Improved Diversion"],
      // Part of an effect spent, which other sentences describe: the overrides say so
      [DIVINE_FEATS, "Swim like a Fish"],
      [ADVENTURER_FEATS, "Cougar's Vision"],
      [DIVINE_FEATS, "Sense Void (Void Disciple)"],
      [ADVENTURER_FEATS, "Quick Hide (Vigilante)"],
      [ADVENTURER_FEATS, "Fearsome Reputation (Dread Pirate)"],
      [ARCANE_FEATS, "Emerald Perfection (Green Star Adept)"],
      [DIVINE_FEATS, "Celestial Companion (Holy Liberator)"],
      [WARRIOR_FEATS, "Defensive Riding (Halfling Outrider)"],
      [WARRIOR_FEATS, "Stone's Hue (Dark Hunter)"],
      [ADVENTURER_FEATS, "Skill Teamwork (Nightsong Enforcer)"],
      [SCOUNDREL_FEATS, "Persona Masks (Master of Masks)"],
      [WONDROUS_ITEMS, "Elixir of Hiding"],
      [WONDROUS_ITEMS, "Goggles of Minute Seeing"],
      [WONDROUS_ITEMS, "Helm of Comprehend Languages and Read Magic"],
      [RODS, "Rod of Flailing"],
      // Goes to the object it coats: its override says so
      [WONDROUS_ITEMS, "Unguent of Timelessness"],
    ] as const) {
      expect({ name, modifiers: seededModifiers(seeds, name) }).toEqual({ name, modifiers: [] });
    }
  });
});
