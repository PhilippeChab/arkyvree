import { describe, expect, test } from "bun:test";

import { SpellDetector } from "@/codegen/dnd3.5/tools/detect/SpellDetector.ts";
import type { SpellReference } from "@/codegen/dnd3.5/tools/types/spells.ts";
import type { SpellFields } from "@/content/dnd3.5/builders/spells/types.ts";
import {
  SPELL_AREA_OF_EFFECT,
  SPELL_CASTING_TIME,
  SPELL_COMPONENT,
  SPELL_DESCRIPTOR,
  SPELL_DURATION,
  SPELL_EFFECT,
  SPELL_RANGE_TYPE,
  SPELL_RESISTANCE,
  SPELL_SCHOOL,
  SPELL_SUBSCHOOL,
  SPELL_TARGET,
} from "@/vocabulary/dnd3.5/fields/index.ts";

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
 * What a spell reference's detector detects for each spell of `raw`, an extension's, by spell: its fields and its
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

/** The fields a spell reference's detector detects for each spell of `raw`, by spell. */
function fieldsDetected(raw: SpellReference["raw"]) {
  return Object.fromEntries(Object.entries(detectedOf(raw)).map(([name, { fields }]) => [name, fields]));
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

describe("A spell's detected fields", () => {
  test("hold its components, a focus the site writes AF among them", () => {
    const detected = fieldsDetected([
      spell("Warded", { components: ["V", "S", "AF", "DF"] }),
      spell("Costly", { components: ["V", "M", "XP"] }),
    ]);
    expect(detected.Warded[SPELL_COMPONENT]).toEqual(["Verbal", "Somatic", "Focus", "Divine Focus"]);
    expect(detected.Costly[SPELL_COMPONENT]).toEqual(["Verbal", "Material", "XP Cost"]);
  });

  test("hold each value its school line combines as its own, a subschool given as a descriptor among its subschools", () => {
    const detected = fieldsDetected([
      spell("Shield", { descriptors: ["Fire or Cold"] }),
      spell("Gate", { school: "Conjuration", subschool: "Creation or Calling" }),
      spell("Mislead", { school: "Illusion", subschool: "Figment and Glamer" }),
      spell("Veil", { school: "Illusion", subschool: "illusion (figment, glamer)" }),
      spell("Noted", { school: "Conjuration", subschool: "Creation (see text)" }),
      spell("Weave", { school: "Illusion", descriptors: ["Pattern"] }),
      spell("Plain", { school: "Conjuration", subschool: "conjuration (summoning)", descriptors: ["mind-affecting"] }),
    ]);
    const schoolLine = (fields: SpellFields): SpellFields => ({
      [SPELL_SUBSCHOOL]: fields[SPELL_SUBSCHOOL],
      [SPELL_DESCRIPTOR]: fields[SPELL_DESCRIPTOR],
    });
    expect(schoolLine(detected.Shield)).toEqual({ [SPELL_DESCRIPTOR]: ["Fire", "Cold"] });
    expect(schoolLine(detected.Gate)).toEqual({ [SPELL_SUBSCHOOL]: ["Creation", "Calling"] });
    expect(schoolLine(detected.Mislead)).toEqual({ [SPELL_SUBSCHOOL]: ["Figment", "Glamer"] });
    expect(schoolLine(detected.Veil)).toEqual({ [SPELL_SUBSCHOOL]: ["Figment", "Glamer"] });
    expect(schoolLine(detected.Noted)).toEqual({ [SPELL_SUBSCHOOL]: ["Creation (see text)"] });
    expect(schoolLine(detected.Weave)).toEqual({ [SPELL_SUBSCHOOL]: ["Pattern"] });
    expect(schoolLine(detected.Plain)).toEqual({
      [SPELL_SUBSCHOOL]: ["Summoning"],
      [SPELL_DESCRIPTOR]: ["Mind-Affecting"],
    });
  });

  test("hold its duration, but none when its source gives none", () => {
    const detected = fieldsDetected([
      spell("Lasting", { duration: "1 round/level (D)" }),
      spell("Unsaid", { duration: "" }),
    ]);
    expect(detected.Lasting[SPELL_DURATION]).toBe("1 round/level (D)");
    expect(detected.Unsaid).not.toHaveProperty(SPELL_DURATION);
  });

  test("hold its Effect line as its effect, beside its target and area, even where they say the same", () => {
    const aimed = (fields: SpellFields): SpellFields => ({
      [SPELL_TARGET]: fields[SPELL_TARGET],
      [SPELL_EFFECT]: fields[SPELL_EFFECT],
      [SPELL_AREA_OF_EFFECT]: fields[SPELL_AREA_OF_EFFECT],
    });
    const detected = fieldsDetected([
      spell("Flame", { target: "Object touched", effect: "Magical, heatless flame" }),
      spell("Summon", { effect: "One summoned creature" }),
      spell("Lasting", { target: "See text", effect: "See text", area: "See text" }),
    ]);
    expect(aimed(detected.Flame)).toEqual({
      [SPELL_TARGET]: "Object touched",
      [SPELL_EFFECT]: "Magical, heatless flame",
    });
    expect(aimed(detected.Summon)).toEqual({ [SPELL_EFFECT]: "One summoned creature" });
    expect(aimed(detected.Lasting)).toEqual({
      [SPELL_TARGET]: "See text",
      [SPELL_EFFECT]: "See text",
      [SPELL_AREA_OF_EFFECT]: "See text",
    });
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
        fields: {
          [SPELL_SCHOOL]: "Evocation",
          [SPELL_COMPONENT]: ["Verbal", "Somatic", "Divine Focus"],
          [SPELL_CASTING_TIME]: "1 round",
          [SPELL_RANGE_TYPE]: "Touch",
          [SPELL_TARGET]: "Living creature touched",
          [SPELL_DURATION]: "1 round",
          [SPELL_RESISTANCE]: "Yes (harmless)",
        },
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
    const castingTime = (name: string) => detected[name].fields[SPELL_CASTING_TIME];
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
    expect(detected.Own.fields[SPELL_RESISTANCE]).toBe("No");
    expect(detected.Own.fields[SPELL_TARGET]).toBe("One creature");
    expect(detected.Swift.savingThrow).toBe("None");
    expect(detected.Swift.fields[SPELL_RESISTANCE]).toBe("No");
    expect(detected.Swift.fields[SPELL_TARGET]).toBe("You");
  });

  test("takes the fields an override corrects as its own", () => {
    const detected = detectedOf(
      [{ ...base, name: "Vigor, Lesser" }, bare("Leaked", "As lesser vigor, except that it heals more.")],
      { Leaked: { duration: "10 min./level", savingThrow: "None", spellResistance: "No" } },
    );
    expect(detected.Leaked.savingThrow).toBe("None");
    expect(detected.Leaked.fields[SPELL_DURATION]).toBe("10 min./level");
    expect(detected.Leaked.fields[SPELL_RESISTANCE]).toBe("No");
    expect(detected.Leaked.fields[SPELL_CASTING_TIME]).toBe("1 round");
  });

  test("takes its base spell's fields as an override corrects them", () => {
    // The site gives Anticipate Teleportation's target as its range
    const anticipate = spell("Anticipate Teleportation", { range: "One willing creature touched" });
    const detected = detectedOf(
      [
        anticipate,
        bare("Anticipate Teleportation, Greater", "As anticipate teleportation, except that it warns more."),
      ],
      { "Anticipate Teleportation": { range: "Touch", target: "One willing creature touched" } },
    );
    for (const name of ["Anticipate Teleportation", "Anticipate Teleportation, Greater"]) {
      expect(detected[name].fields[SPELL_RANGE_TYPE]).toBe("Touch");
      expect(detected[name].fields[SPELL_TARGET]).toBe("One willing creature touched");
    }
  });
});
