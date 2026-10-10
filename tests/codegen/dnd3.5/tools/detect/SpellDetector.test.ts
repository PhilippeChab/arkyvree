import { describe, expect, test } from "bun:test";

import { SpellDetector } from "@/codegen/dnd3.5/tools/detect/SpellDetector.ts";
import type { SpellReference } from "@/codegen/dnd3.5/tools/types/spells.ts";

/** A spell whose stat block gives only its school and level, its text `description`. */
function bare(name: string, description: string, fields: Partial<SpellReference["raw"][number]> = {}) {
  return spell(name, {
    castingTime: "",
    components: [],
    description,
    duration: "",
    range: "",
    savingThrow: "",
    spellResistance: "",
    ...fields,
  });
}

/**
 * What a spell reference's detector detects for each spell of `raw`, an extension's, by spell: its properties and its
 * saving throw. Its overrides are `overrides`, and the core rules' spells `coreRaw`.
 */
function detectedOf(
  raw: SpellReference["raw"],
  overrides: SpellReference["overrides"] = {},
  coreRaw: SpellReference["raw"] = [],
) {
  return new SpellDetector(
    { _meta: { book: "complete-arcane", scrapedAt: "", sourceUrl: "", type: "spell" }, overrides, raw },
    { raw: coreRaw },
  ).resolve().detected;
}

/** The properties a spell reference's detector detects for each spell of `raw`, by spell. */
function propertiesDetected(raw: SpellReference["raw"]) {
  return Object.fromEntries(Object.entries(detectedOf(raw)).map(([name, { properties }]) => [name, properties]));
}

/** A scraped spell: a 1st-level wizard evocation, with `fields`. */
function spell(name: string, fields: Partial<SpellReference["raw"][number]>): SpellReference["raw"][number] {
  return {
    castingTime: "1 standard action",
    components: ["V", "S"],
    description: "",
    descriptors: [],
    duration: "Instantaneous",
    levelEntries: [{ className: "Wizard", level: 1 }],
    name,
    range: "Close (25 ft. + 5 ft./2 levels)",
    savingThrow: "None",
    school: "Evocation",
    slug: name.toLowerCase(),
    spellResistance: "Yes",
    ...fields,
  };
}

describe("A spell's detected properties", () => {
  test("hold its components, a focus the site writes AF among them", () => {
    const components = (properties: { type: string; value: string }[]) =>
      properties.filter(({ type }) => type === "SPELL_COMPONENT").map(({ value }) => value);
    const detected = propertiesDetected([
      spell("Warded", { components: ["V", "S", "AF", "DF"] }),
      spell("Costly", { components: ["V", "M", "XP"] }),
    ]);
    expect(components(detected.Warded)).toEqual(["Verbal", "Somatic", "Focus", "Divine Focus"]);
    expect(components(detected.Costly)).toEqual(["Verbal", "Material", "XP Cost"]);
  });

  test("hold its duration, but none when its source gives none", () => {
    const detected = propertiesDetected([
      spell("Lasting", { duration: "1 round/level (D)" }),
      spell("Unsaid", { duration: "" }),
    ]);
    expect(detected.Lasting).toContainEqual({ type: "SPELL_DURATION", value: "1 round/level (D)" });
    expect(detected.Unsaid.filter(({ type }) => type === "SPELL_DURATION")).toEqual([]);
  });

  test("hold its Effect line as its effect, beside its target and area, even where they say the same", () => {
    const aimed = (properties: { type: string; value: string }[]) =>
      properties.filter(({ type }) => ["SPELL_TARGET", "SPELL_EFFECT", "SPELL_AREA_OF_EFFECT"].includes(type));
    const detected = propertiesDetected([
      spell("Flame", { target: "Object touched", effect: "Magical, heatless flame" }),
      spell("Summon", { effect: "One summoned creature" }),
      spell("Lasting", { target: "See text", effect: "See text", area: "See text" }),
    ]);
    expect(aimed(detected.Flame)).toEqual([
      { type: "SPELL_TARGET", value: "Object touched" },
      { type: "SPELL_EFFECT", value: "Magical, heatless flame" },
    ]);
    expect(aimed(detected.Summon)).toEqual([{ type: "SPELL_EFFECT", value: "One summoned creature" }]);
    expect(aimed(detected.Lasting)).toEqual([
      { type: "SPELL_TARGET", value: "See text" },
      { type: "SPELL_EFFECT", value: "See text" },
      { type: "SPELL_AREA_OF_EFFECT", value: "See text" },
    ]);
  });
});

describe("A spell written as another", () => {
  const base = spell("Lesser Vigor", {
    castingTime: "1 round",
    components: ["V", "S", "DF"],
    duration: "10 rounds",
    range: "Touch",
    savingThrow: "Will negates (harmless)",
    spellResistance: "Yes (harmless)",
    target: "Living creature touched",
  });

  test("takes the fields its stat block leaves out from the spell its text names, whatever the wording", () => {
    const wordings = [
      "As lesser vigor, except that it heals more.",
      "This spell functions as lesser vigor, except as noted above.",
      "This spell is the same as lesser vigor, but it heals more.",
      "It heals more. It is otherwise the same as lesser vigor.",
      "The spell otherwise works as the lesser vigor spell, but it heals more.",
      "This spell functions like lesser vigor, except that it heals more.",
    ];
    const detected = detectedOf([
      { ...base, name: "Vigor, Lesser" },
      ...wordings.map((wording, index) => bare(`Vigor ${index}`, wording, { duration: "1 round" })),
    ]);
    for (const index of wordings.keys()) {
      expect(detected[`Vigor ${index}`]).toEqual({
        properties: [
          { type: "SPELL_SCHOOL", value: "Evocation" },
          { type: "SPELL_CASTING_TIME", value: "1 round" },
          { type: "SPELL_RANGE_TYPE", value: "Touch" },
          { type: "SPELL_TARGET", value: "Living creature touched" },
          { type: "SPELL_DURATION", value: "1 round" },
          { type: "SPELL_RESISTANCE", value: "Yes (harmless)" },
          { type: "SPELL_COMPONENT", value: "Verbal" },
          { type: "SPELL_COMPONENT", value: "Somatic" },
          { type: "SPELL_COMPONENT", value: "Divine Focus" },
        ],
        savingThrow: "Will negates (harmless)",
      });
    }
  });

  test("finds it by its qualifiers, its name's end, or among the core rules' spells", () => {
    const detected = detectedOf(
      [
        { ...base, name: "Vigor, Mass Lesser" },
        bare("Vigorous Circle", "This spell is the same as mass lesser vigor, except that it heals more."),
        bare("Mass Darkvision", "As darkvision, except that all target creatures receive the spell's benefits."),
        bare("Poison Vines", "The spell otherwise works as the entangle spell, but the plants are poisonous."),
      ],
      {},
      [
        { ...base, name: "Darkvision", castingTime: "1 standard action" },
        { ...base, name: "Bigby's Entangle", castingTime: "1 minute" },
      ],
    );
    const castingTime = (name: string) =>
      detected[name].properties.find(({ type }) => type === "SPELL_CASTING_TIME")?.value;
    expect(castingTime("Vigorous Circle")).toBe("1 round");
    expect(castingTime("Mass Darkvision")).toBe("1 standard action");
    expect(castingTime("Poison Vines")).toBe("1 minute");
  });

  test("keeps what its own stat block states, and takes no saving throw or spell resistance when it's personal", () => {
    const detected = detectedOf([
      { ...base, name: "Vigor, Lesser" },
      bare("Own", "As lesser vigor, except as noted above.", {
        savingThrow: "Fortitude half",
        spellResistance: "No",
        target: "One creature",
      }),
      bare("Swift", "This spell functions as lesser vigor, except as noted above.", {
        range: "Personal",
        target: "You",
      }),
    ]);
    expect(detected.Own.savingThrow).toBe("Fortitude half");
    expect(detected.Own.properties).toContainEqual({ type: "SPELL_RESISTANCE", value: "No" });
    expect(detected.Own.properties).toContainEqual({ type: "SPELL_TARGET", value: "One creature" });
    expect(detected.Own.properties).not.toContainEqual({ type: "SPELL_TARGET", value: "Living creature touched" });
    expect(detected.Swift.savingThrow).toBe("None");
    expect(detected.Swift.properties).toContainEqual({ type: "SPELL_RESISTANCE", value: "No" });
    expect(detected.Swift.properties).toContainEqual({ type: "SPELL_TARGET", value: "You" });
  });

  test("takes the fields an override corrects as its own", () => {
    const detected = detectedOf(
      [{ ...base, name: "Vigor, Lesser" }, bare("Leaked", "As lesser vigor, except that it heals more.")],
      { Leaked: { duration: "10 min./level", savingThrow: "None", spellResistance: "No" } },
    );
    expect(detected.Leaked.savingThrow).toBe("None");
    expect(detected.Leaked.properties).toContainEqual({ type: "SPELL_DURATION", value: "10 min./level" });
    expect(detected.Leaked.properties).toContainEqual({ type: "SPELL_RESISTANCE", value: "No" });
    expect(detected.Leaked.properties).toContainEqual({ type: "SPELL_CASTING_TIME", value: "1 round" });
  });
});
