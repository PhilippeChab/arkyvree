import { describe, expect, test } from "bun:test";

import { SpellDetector } from "@/codegen/dnd3.5/tools/detect/SpellDetector.ts";
import type { SpellReference } from "@/codegen/dnd3.5/tools/types/spells.ts";

/** The properties a spell reference's detector detects for each spell of `raw`, by spell. */
function propertiesDetected(raw: SpellReference["raw"]) {
  const { detected } = new SpellDetector({
    _meta: { book: "srd", scrapedAt: "", sourceUrl: "", type: "spell" },
    raw,
  }).resolve();
  return Object.fromEntries(Object.entries(detected).map(([name, { properties }]) => [name, properties]));
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
