import { describe, expect, test } from "bun:test";

import {
  buildModifierMapping,
  detectModifiersOf,
} from "@/database/packages/dnd35-from-parser/tools/detect/modifiers.ts";
import type { Modifier } from "@/database/packages/dnd35/content/customization/types.ts";

const DEXTERITY: Modifier = { target: "abilities.dexterity.misc", operator: "add", value: "2", valueType: "number" };
const STRENGTH: Modifier = { target: "abilities.strength.misc", operator: "add", value: "2", valueType: "number" };

describe("Detected modifiers", () => {
  test("are each entry's, with its errors and unresolved text only when it has some", () => {
    const detected = detectModifiersOf([{ name: "Strong" }, { name: "Garbled" }], ({ name }) =>
      name === "Strong"
        ? { modifiers: [STRENGTH], errors: [], unresolved: [] }
        : { modifiers: [], errors: ["invalid path: x"], unresolved: ["+2 on something"] },
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
    expect(
      buildModifierMapping(raw, detected, overrides, (override) => (override?.skip ? { skip: true } : {})),
    ).toEqual({
      Detected: { description: "Detected text", modifiers: [STRENGTH] },
      None: { description: "None text" },
      Overridden: { description: "Corrected", modifiers: [DEXTERITY], skip: true },
      Cleared: { description: "Cleared text" },
    });
  });
});
