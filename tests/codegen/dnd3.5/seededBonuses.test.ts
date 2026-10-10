import { describe, expect, test } from "bun:test";

import { BOOK as ADVENTURER } from "@/content/dnd3.5/generated/complete-adventurer/index.ts";
import { BOOK as ARCANE } from "@/content/dnd3.5/generated/complete-arcane/index.ts";
import { BOOK as DIVINE } from "@/content/dnd3.5/generated/complete-divine/index.ts";
import { BOOK as SCOUNDREL } from "@/content/dnd3.5/generated/complete-scoundrel/index.ts";
import { BOOK as WARRIOR } from "@/content/dnd3.5/generated/complete-warrior/index.ts";
import { RODS, WONDROUS_ITEMS } from "@/content/dnd3.5/generated/srd/items/index.ts";
import { ALL_RACES } from "@/content/dnd3.5/generated/srd/races.ts";

/** Each book's feats, its standalone ones and its classes'. */
const ADVENTURER_FEATS = [...ADVENTURER.standaloneFeats, ...ADVENTURER.classFeats];
const ARCANE_FEATS = [...ARCANE.standaloneFeats, ...ARCANE.classFeats];
const DIVINE_FEATS = [...DIVINE.standaloneFeats, ...DIVINE.classFeats];
const SCOUNDREL_FEATS = [...SCOUNDREL.standaloneFeats, ...SCOUNDREL.classFeats];
const WARRIOR_FEATS = [...WARRIOR.standaloneFeats, ...WARRIOR.classFeats];

/** The modifiers seeded with the entity named `name` of `seeds`, each as "target +value". */
function seededModifiers(seeds: { modifiers?: { target: string; value: string }[]; name: string }[], name: string) {
  const seed = seeds.find((entry) => entry.name === name);
  if (!seed) throw new Error(`${name} isn't seeded`);
  return (seed.modifiers ?? []).map(({ target, value }) => `${target} +${value}`).sort();
}

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

  test("give a class feature the bonus it comes with at its level, but not one a condition still holds", () => {
    // "When she attains 6th level, a dervish gains a +2 bonus on initiative rolls": the level the feature is granted at
    expect(seededModifiers(WARRIOR_FEATS, "Improved Reaction (Dervish)")).toEqual(["combat.initiative.misc +2"]);
    // "When she attains 7th level, … +4 bonus to Armor Class when she chooses to fight defensively"
    expect(seededModifiers(WARRIOR_FEATS, "Elaborate Parry (Dervish)")).toEqual([]);
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
    ] as const)
      expect({ name, modifiers: seededModifiers(seeds, name) }).toEqual({ name, modifiers: [] });
  });
});
