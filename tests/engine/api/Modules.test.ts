import { describe, expect, test } from "bun:test";

import { baseRules } from "@/drizzle/schema.ts";
import Modules from "@/engine/api/Modules.ts";

describe("The modules' registry", () => {
  test("has a module for each base rules the database knows", () => {
    for (const rules of baseRules.enumValues) expect(Modules.of(rules)).toBeDefined();
  });

  test("builds each base rules' module once, with fresh characters and paths on each call", () => {
    const module = Modules.of("Dungeons & Dragons: 3.5");
    expect(Modules.of("Dungeons & Dragons: 3.5")).toBe(module);
    expect(module.createTargetPaths()).not.toBe(module.createTargetPaths());
  });
});
