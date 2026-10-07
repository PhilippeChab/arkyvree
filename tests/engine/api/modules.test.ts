import { describe, expect, test } from "bun:test";

import { baseRules } from "@/drizzle/schema.ts";
import { getRulesetModule } from "@/engine/api/modules.ts";

describe("The modules' registry", () => {
  test("has a module for each base rules the database knows", () => {
    for (const rules of baseRules.enumValues) expect(getRulesetModule(rules)).toBeDefined();
  });

  test("builds each base rules' module once, with fresh characters and paths on each call", () => {
    const module = getRulesetModule("Dungeons & Dragons: 3.5");
    expect(getRulesetModule("Dungeons & Dragons: 3.5")).toBe(module);
    expect(module.createTargetPaths()).not.toBe(module.createTargetPaths());
  });
});
