import { describe, expect, test } from "bun:test";

import { ALL_FEATS as ADVENTURER_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-adventurer/feats/index.ts";
import { ALL_FEATS as ARCANE_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-arcane/feats/index.ts";
import { ALL_FEATS as DIVINE_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-divine/feats/index.ts";
import { ALL_FEATS as SCOUNDREL_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-scoundrel/feats/index.ts";
import { ALL_FEATS as WARRIOR_FEATS } from "@/database/packages/dnd35-from-parser/generated/complete-warrior/feats/index.ts";
import { RODS, WONDROUS_ITEMS } from "@/database/packages/dnd35-from-parser/generated/srd/items/index.ts";
import { ALL_RACES } from "@/database/packages/dnd35-from-parser/generated/srd/races/data.ts";
import { isConditional } from "@/database/packages/dnd35-from-parser/tools/scraper/conditional.ts";
import { readSkillBonuses } from "@/database/packages/dnd35-from-parser/tools/scraper/skillBonuses.ts";

/** The skill bonuses a text gives, each as "slug +value", or "?name" for a name that isn't a skill. */
const bonuses = (text: string) =>
  readSkillBonuses(text, () => false).map(({ slug, name, value }) => (slug ? `${slug} +${value}` : `?${name}`));

/** Whether the first bonus ("+N …") in `text` applies only sometimes. */
const conditional = (text: string) => {
  const start = text.indexOf("+");
  const end = text.indexOf(" checks", start) + " checks".length;
  return isConditional(text, start, end);
};

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
    // A race's traits are joined by a separator: each is its own sentence
    expect(conditional("+2 racial bonus on Listen checks.\u0001Proficient with longswords only when trained.")).toBe(
      false,
    );
  });
});

/** The modifiers seeded with the entity named `name` of `seeds`, each as "target +value". */
const seededModifiers = (seeds: { name: string; modifiers?: { target: string; value: string }[] }[], name: string) => {
  const seed = seeds.find((entry) => entry.name === name);
  if (!seed) throw new Error(`${name} isn't seeded`);
  return (seed.modifiers ?? []).map(({ target, value }) => `${target} +${value}`).sort();
};

describe("The seeded bonuses the rules read", () => {
  test("give a feat, a class feature or a race its permanent skill bonuses", () => {
    expect(seededModifiers(DIVINE_FEATS, "Swim like a Fish")).toEqual(["skills.swim.misc +8"]);
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
    // A race's traits are each their own sentence
    expect(seededModifiers(ALL_RACES, "Elf")).toEqual(
      expect.arrayContaining(["skills.listen.misc +2", "skills.search.misc +2", "skills.spot.misc +2"]),
    );
  });

  test("keep what's worn, held or carried as a standing state", () => {
    expect(seededModifiers(WARRIOR_FEATS, "Dash")).toEqual(["combat.speed.misc +5"]);
    expect(seededModifiers(RODS, "Rod of Splendor")).toEqual(["abilities.charisma.misc +4"]);
  });

  test("leave out a bonus that's conditional, used, narrowed, someone else's or a choice", () => {
    for (const [seeds, name] of [
      [ADVENTURER_FEATS, "Improved Diversion"],
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
    ] as const) {
      expect({ name, modifiers: seededModifiers(seeds, name) }).toEqual({ name, modifiers: [] });
    }
  });
});
