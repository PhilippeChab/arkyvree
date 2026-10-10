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
  test("hold its duration, but none when its source gives none", () => {
    const detected = propertiesDetected([
      spell("Lasting", { duration: "1 round/level (D)" }),
      spell("Unsaid", { duration: "" }),
    ]);
    expect(detected.Lasting).toContainEqual({ type: "SPELL_DURATION", value: "1 round/level (D)" });
    expect(detected.Unsaid.filter(({ type }) => type === "SPELL_DURATION")).toEqual([]);
  });
});
