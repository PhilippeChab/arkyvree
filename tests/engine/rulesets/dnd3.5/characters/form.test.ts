import { describe, expect, test } from "bun:test";

import type { CreationItem } from "@/engine/core/module/index.ts";
import { CHARACTER_FORM } from "@/engine/rulesets/dnd3.5/characters/form.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_DEITY,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
} from "@/vocabulary/dnd3.5/fields/index.ts";

/** The new character's form's fields, by the stored field its create sends each by. */
function fieldsByKey(): Record<string, CreationItem> {
  const items = CHARACTER_FORM.sections.flatMap((section) => (section.kind === "fields" ? section.lines.flat() : []));
  return Object.fromEntries(items.flatMap((item) => ("key" in item ? [[item.key, item]] : [])));
}

describe("A new 3.5 character's form", () => {
  test("lays out its fields as they're declared, by their stored fields, those it never leaves at none required", () => {
    const fields = fieldsByKey();
    expect(fields[CHARACTER_XP]).toEqual({
      key: CHARACTER_XP,
      kind: "number",
      label: "Experience Points",
      min: 0,
      required: "Experience Points is required",
      start: 0,
    });
    for (const [key, label] of [
      [CHARACTER_ALIGNMENT, "Alignment"],
      [CHARACTER_GENDER, "Gender"],
    ]) {
      expect(fields[key]).toMatchObject({
        key,
        kind: "select",
        label,
        narrows: true,
        required: `${label} is required`,
      });
    }
    expect(fields[CHARACTER_AGE]).toEqual({ key: CHARACTER_AGE, kind: "number", label: "Age", min: 1, stepped: true });
    expect(fields[CHARACTER_HEIGHT]).toEqual({
      key: CHARACTER_HEIGHT,
      kind: "text",
      label: "Height",
      placeholder: "e.g., 5 feet 8 inches",
    });
    expect(fields[CHARACTER_WEIGHT]).toMatchObject({ kind: "text", placeholder: "e.g., 150 lbs, 68kg" });
    expect(fields[CHARACTER_DEITY]).toEqual({ key: CHARACTER_DEITY, kind: "text", label: "Deity" });
  });
});
