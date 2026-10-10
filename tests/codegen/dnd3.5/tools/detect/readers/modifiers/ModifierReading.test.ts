import { describe, expect, test } from "bun:test";

import { ModifierReading } from "@/codegen/dnd3.5/tools/detect/readers/modifiers/ModifierReading.ts";
import { bonus } from "@/content/core/builders/customization/modifiers.ts";
import type { Modifier } from "@/content/core/builders/customization/types.ts";

/** A reading of `modifiers`, its paths checked as every reading checks them (a benefit's, a race's, an item's…). */
class CheckedReading extends ModifierReading<Modifier> {
  constructor(...modifiers: Modifier[]) {
    super();
    this.modifiers.push(...modifiers);
    this.keepValidModifiers();
  }
}

describe("A modifier reading", () => {
  test("leaves out a modifier whose path no character has, in its errors", () => {
    const reading = new CheckedReading(bonus("skills.climb.misc", 2), bonus("skills.basketweaving.misc", 2));
    expect(reading.modifiers).toEqual([bonus("skills.climb.misc", 2)]);
    expect(reading.errors).toEqual(['Invalid modifier path "skills.basketweaving.misc": add 2']);
  });
});
