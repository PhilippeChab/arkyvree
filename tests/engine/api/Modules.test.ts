import { describe, expect, test } from "bun:test";

import { modulesInRules } from "@/drizzle/schema.ts";
import Modules from "@/engine/api/Modules.ts";
import { db } from "@/server/database/index.ts";
import type { BaseRules } from "@/shared/enums.ts";

describe("The modules' registry", () => {
  test("has a module for each base rules the database knows", async () => {
    const known = await db.select().from(modulesInRules);
    expect(known.length).toBeGreaterThan(0);
    for (const { baseRules } of known) expect(Modules.of(baseRules as BaseRules)).toBeDefined();
  });

  test("builds each base rules' module once, with fresh characters and paths on each call", () => {
    const module = Modules.of("Dungeons & Dragons: 3.5");
    expect(Modules.of("Dungeons & Dragons: 3.5")).toBe(module);
    expect(module.createTargetPaths()).not.toBe(module.createTargetPaths());
  });
});
