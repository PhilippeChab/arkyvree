import { describe, expect, test } from "bun:test";

import { RaceDetector } from "@/database/packages/dnd35-from-parser/tools/detect/RaceDetector.ts";
import type { RaceReference } from "@/database/packages/dnd35-from-parser/tools/types/races.ts";

function add(target: string, value: number) {
  return {
    target,
    operator: "add",
    value: String(value),
    valueType: "number",
  };
}

function race(name: string, abilityAdjustments: { ability: string; value: number }[], ...features: string[]) {
  return {
    name,
    description: "",
    size: "Medium",
    baseSpeed: 30,
    abilityAdjustments,
    features: features.map((feature) => ({ name: feature, description: "" })),
  };
}

/** What a race reference's detector detects in `raw`. */
function racesDetected(raw: RaceReference["raw"]) {
  return new RaceDetector({ _meta: { book: "srd", scrapedAt: "", sourceUrl: "", type: "race" }, raw }).resolve()
    .detected;
}

describe("A race's detected modifiers", () => {
  test("are its ability adjustments, and its unconditional skill and save bonuses", () => {
    const detected = racesDetected([
      race(
        "Stout",
        [
          { ability: "Constitution", value: 2 },
          { ability: "Luck", value: 1 },
        ],
        "+2 racial bonus on Climb and Jump checks",
        "+2 racial bonus on Search checks made to notice unusual stonework",
        "+1 racial bonus on Underwater Basketry checks",
        "+1 racial bonus on all saving throws",
      ),
      race(
        "Hardy",
        [],
        "+2 racial bonus on Fortitude saving throws against poison, and a +1 racial bonus on Will saving throws",
        "+1 racial bonus on all saving throws against fear, and a +2 racial bonus on Reflex saving throws",
        "+2 racial bonus on Will saving throws vs. enchantment spells",
        "+2 racial bonus on Fortitude saving throws for resisting poison",
        "+2 racial bonus on Listen checks if the creature can hear",
        "+2 racial bonus on Spot checks, while in shadow",
      ),
      race(
        "Twice",
        [],
        "+1 racial bonus on Fortitude saving throws and a +2 racial bonus on Will saving throws",
        "+1 racial bonus on all saving throws, and another +1 racial bonus on all saving throws",
        "+2 racial bonus on Hide checks, to a maximum of +10",
      ),
    ]);
    expect(detected.Stout).toEqual({
      modifiers: [
        add("abilities.constitution.misc", 2),
        add("skills.climb.misc", 2),
        add("skills.jump.misc", 2),
        add("saves.fortitude.misc", 1),
        add("saves.reflex.misc", 1),
        add("saves.will.misc", 1),
      ],
      unresolvedModifiers: [`Unknown ability: "Luck"`, `Unresolved skill bonus: +1 on "Underwater Basketry"`],
    });
    expect(detected.Hardy).toEqual({ modifiers: [add("saves.will.misc", 1), add("saves.reflex.misc", 2)] });
    // Each bonus of a text, whatever follows a comma but a condition
    expect(detected.Twice).toEqual({
      modifiers: [
        add("saves.fortitude.misc", 1),
        add("saves.will.misc", 2),
        ...["fortitude", "reflex", "will", "fortitude", "reflex", "will"].map((save) => add(`saves.${save}.misc`, 1)),
        add("skills.hide.misc", 2),
      ],
    });
  });
});

describe("A race's mapping", () => {
  test("takes its description and modifiers from its override, else from what's scraped and detected", () => {
    const strong = (name: string) => ({
      ...race(name, [{ ability: "Strength", value: 2 }]),
      description: `${name} text`,
    });
    const dexterity = add("abilities.dexterity.misc", 2);
    const { mapping } = new RaceDetector({
      _meta: { book: "srd", scrapedAt: "", sourceUrl: "", type: "race" },
      raw: [
        strong("Detected"),
        { ...race("None", []), description: "None text" },
        strong("Overridden"),
        strong("Cleared"),
      ],
      overrides: {
        Overridden: { description: "Corrected", modifiers: [dexterity], skip: true },
        Cleared: { modifiers: [] },
      },
    }).resolve();
    const medium = { size: "Medium", baseSpeed: 30 };
    expect(mapping).toEqual({
      Detected: {
        name: "Detected",
        description: "Detected text",
        modifiers: [add("abilities.strength.misc", 2)],
        ...medium,
      },
      None: { name: "None", description: "None text", ...medium },
      Overridden: { name: "Overridden", description: "Corrected", modifiers: [dexterity], skip: true, ...medium },
      Cleared: { name: "Cleared", description: "Cleared text", ...medium },
    });
  });
});
