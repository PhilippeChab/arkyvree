import { describe, expect, test } from "bun:test";
import { join } from "node:path";

import References from "@/codegen/dnd3.5/tools/references/References.ts";
import type { StoredReference } from "@/codegen/dnd3.5/tools/types/reference.ts";
import { ClassOverridesCheck } from "@/codegen/dnd3.5/tools/validate/ClassOverridesCheck.ts";

const REFERENCE = join(import.meta.dirname, "../../../../../codegen/dnd3.5/reference");

/** A committed class reference, with its overrides changed by `change`. */
function classReference(
  file: string,
  change: (
    overrides: NonNullable<StoredReference<"class">["overrides"]>,
    stored: StoredReference<"class">,
  ) => void = () => {},
) {
  const stored = structuredClone(References.stored(join(REFERENCE, file), "class"));
  stored.overrides ??= {};
  change(stored.overrides, stored);
  return stored;
}

function derived(stored: StoredReference<"class">) {
  return References.resolve("class", { _meta: stored._meta, raw: stored.raw });
}

describe("A redundant class override", () => {
  test("is none of a committed class's, which the generator needs", () => {
    for (const file of [
      "srd/classes/barbarian.json",
      "srd/classes/wizard.json",
      "complete-divine/classes/spiritShaman.json",
      "complete-warrior/classes/drunkenMaster.json",
    ]) {
      expect({ file, redundant: new ClassOverridesCheck(classReference(file)).redundant() }).toEqual({
        file,
        redundant: [],
      });
    }
  });

  test("is one equal to what's detected", () => {
    const stored = classReference("srd/classes/barbarian.json", (overrides, s) => {
      overrides.bab = derived(s).detected.bab;
    });
    expect(new ClassOverridesCheck(stored).redundant()).toContain("bab");
  });

  test("is a spells field equal to the detected one, though the rest of the spells override changes something", () => {
    const stored = classReference("srd/classes/wizard.json", (overrides, s) => {
      overrides.spells = { ...overrides.spells, perDay: derived(s).mapping.spells?.perDay };
    });
    expect(new ClassOverridesCheck(stored).redundant()).toEqual(["spells.perDay"]);
  });

  test("is a feature field removed where the feature has none", () => {
    const stored = classReference("srd/classes/barbarian.json", (overrides) => {
      overrides.features = {
        ...overrides.features,
        "Fast Movement": { ...overrides.features?.["Fast Movement"], aptitude: null },
      };
    });
    expect(new ClassOverridesCheck(stored).redundant()).toEqual(["features.Fast Movement.aptitude"]);
  });

  test("isn't aptitude picks equal to the detected ones while picks are unresolved: they stand for the reviewed picks", () => {
    const stored = classReference("complete-adventurer/classes/exemplar.json", (overrides, s) => {
      overrides.aptitudePicks = derived(s).detected.aptitudePicks;
    });
    expect(derived(stored).detected.unresolvedAptitudePicks?.length).toBeGreaterThan(0);
    expect(new ClassOverridesCheck(stored).redundant()).not.toContain("aptitudePicks");
  });

  test("isn't a correction that differs from what's detected, though nothing uses it today", () => {
    // Drunken Master grants Improved Feint, an existing feat, so its own text isn't generated; the correction stays.
    const stored = classReference("complete-warrior/classes/drunkenMaster.json");
    const override = stored.overrides?.features?.["Improved Feint"]?.description;
    expect(override).toBeDefined();
    expect(override).not.toBe(derived(stored).mapping.features["Improved Feint"]?.description);
    expect(new ClassOverridesCheck(stored).redundant()).not.toContain("features.Improved Feint.description");
  });

  test("isn't a spell list a class inherits, which shapes the book's copied spells", () => {
    const stored = classReference("complete-divine/classes/favoredSoul.json");
    expect(stored.overrides?.spells?.inheritsFrom).toBeDefined();
    expect(new ClassOverridesCheck(stored).redundant()).toEqual([]);
  });
});

describe("A class override the generator ignores", () => {
  test("is spells, even a spell list it inherits, for a class without detected spells", () => {
    for (const spells of [{ perDay: [[1]] }, { inheritsFrom: { classes: ["Cleric"] } }]) {
      const stored = classReference("srd/classes/barbarian.json", (overrides) => {
        overrides.spells = spells;
      });
      expect(new ClassOverridesCheck(stored).ignored()).toEqual(["spells"]);
    }
  });

  test("is noSpells, for a class without detected spells", () => {
    const stored = classReference("srd/classes/barbarian.json", (overrides) => {
      overrides.noSpells = true;
    });
    expect(new ClassOverridesCheck(stored).ignored()).toEqual(["noSpells"]);
  });

  test("is an alignment, when the page gives one", () => {
    const stored = classReference("srd/classes/barbarian.json", (overrides, s) => {
      s.raw.prerequisites.parsed.alignment = "Any nonlawful";
      overrides.alignment = "Any chaotic";
    });
    expect(new ClassOverridesCheck(stored).ignored()).toEqual(["alignment"]);
  });

  test("is none of a committed class's", () => {
    for (const file of [
      "srd/classes/barbarian.json",
      "srd/classes/wizard.json",
      "complete-divine/classes/favoredSoul.json",
    ])
      expect({ file, ignored: new ClassOverridesCheck(classReference(file)).ignored() }).toEqual({ file, ignored: [] });
  });
});

describe("A class the generator refuses", () => {
  test("is reported, and has no redundant overrides", () => {
    const stored = classReference("srd/classes/barbarian.json", (overrides) => {
      overrides.bonusSpellAbility = "Wisdom";
    });
    expect(new ClassOverridesCheck(stored).refusal()).toContain('has bonusSpellAbility ("Wisdom") but no casterType');
    expect(new ClassOverridesCheck(stored).redundant()).toEqual([]);
    expect(new ClassOverridesCheck(classReference("srd/classes/barbarian.json")).refusal()).toBeUndefined();
  });
});
