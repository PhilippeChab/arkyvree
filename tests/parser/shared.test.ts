import { describe, expect, test } from "bun:test";

import {
  anySkillRequirement,
  checkedValue,
  checkOneOf,
  detectModifiersOf,
  modifierMapping,
  skillSlug,
} from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import { gte, or } from "@/database/packages/dnd35/content/requirements.ts";
import { SKILL_NAMES } from "@/database/packages/dnd35/content/skills.ts";
import type { Modifier } from "@/database/packages/dnd35/content/types.ts";
import { isOneOf } from "@/shared/isOneOf.ts";
import { stripSeparators } from "@/shared/text.ts";

const DEXTERITY: Modifier = { target: "abilities.dexterity.misc", operator: "add", value: "2", valueType: "number" };
const STRENGTH: Modifier = { target: "abilities.strength.misc", operator: "add", value: "2", valueType: "number" };

describe("Detected modifiers", () => {
  test("are each entry's, with its errors and unresolved text only when it has some", () => {
    const detected = detectModifiersOf([{ name: "Strong" }, { name: "Garbled" }], ({ name }) =>
      name === "Strong"
        ? { modifiers: [STRENGTH], errors: [], unresolvedModifiers: [] }
        : { modifiers: [], errors: ["invalid path: x"], unresolvedModifiers: ["+2 on something"] },
    );
    expect(detected).toEqual({
      Strong: { modifiers: [STRENGTH] },
      Garbled: { modifiers: [], errors: ["invalid path: x"], unresolvedModifiers: ["+2 on something"] },
    });
  });
});

describe("A modifier mapping", () => {
  test("takes an entry's description and modifiers from its override, else from what's scraped and detected", () => {
    const raw = ["Detected", "None", "Overridden", "Cleared"].map((name) => ({ name, description: `${name} text` }));
    const detected = {
      Detected: { modifiers: [STRENGTH] },
      None: { modifiers: [] },
      Overridden: { modifiers: [STRENGTH] },
      Cleared: { modifiers: [STRENGTH] },
    };
    const overrides: Record<string, { description?: string; modifiers?: Modifier[]; skip?: boolean } | undefined> = {
      Overridden: { description: "Corrected", modifiers: [DEXTERITY], skip: true },
      Cleared: { modifiers: [] },
    };
    expect(modifierMapping(raw, detected, overrides, (override) => (override?.skip ? { skip: true } : {}))).toEqual({
      Detected: { description: "Detected text", modifiers: [STRENGTH] },
      None: { description: "None text" },
      Overridden: { description: "Corrected", modifiers: [DEXTERITY], skip: true },
      Cleared: { description: "Cleared text" },
    });
  });
});

describe("A skill's slug", () => {
  test("is its own, or its base skill's for a specialization the skill list doesn't name", () => {
    expect(skillSlug("Knowledge (Arcana)")).toBe("knowledgearcana");
    expect(skillSlug("Perform (dance)")).toBe("perform");
    expect(skillSlug("Tumble")).toBe("tumble");
  });
});

describe("An any-skill requirement", () => {
  test("is the ranks in any skill the name covers", () => {
    const knowledge = SKILL_NAMES.filter((s) => s.startsWith("Knowledge"));
    expect(anySkillRequirement("Knowledge (any)", 8)).toEqual(
      or(...knowledge.map((s) => gte(`skills.${stripSeparators(s)}.rank`, 8))),
    );
    expect(anySkillRequirement("Tumble (any)", 4)).toEqual(gte("skills.tumble.rank", 4));
  });

  test("is none for a name that isn't an any-skill one, or covers no skill", () => {
    expect(anySkillRequirement("Knowledge (arcana)", 8)).toBeUndefined();
    expect(anySkillRequirement("Basketweaving (any)", 8)).toBeUndefined();
  });
});

describe("A value of a fixed set", () => {
  test("is one of its options, or refused with what it is", () => {
    expect(isOneOf("Medium", ["Small", "Medium"])).toBe(true);
    expect(isOneOf("medium", ["Small", "Medium"])).toBe(false);
    expect(isOneOf(undefined, ["Small", "Medium"])).toBe(false);
    expect(checkOneOf("Small", ["Small", "Medium"], "Elf's size")).toEqual({ ok: true, value: "Small" });
    const titanic = checkOneOf("Titanic", ["Small", "Medium"], "Elf's size");
    expect(titanic).toEqual({ ok: false, problem: `Elf's size: "Titanic" isn't one of Small, Medium` });
    expect(checkedValue(checkOneOf("Small", ["Small"], "Elf's size"))).toBe("Small");
    expect(() => checkedValue(titanic)).toThrow(`Elf's size: "Titanic"`);
  });
});
