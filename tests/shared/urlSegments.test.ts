import { describe, expect, test } from "bun:test";

import { getEntityTypeOfSegment, getUrlSegment, getUrlSegments } from "@/shared/urlSegments.ts";

describe("URL segments", () => {
  test("join an entity type's words by hyphens, and name a one-word type by itself", () => {
    expect(getUrlSegments(["owner_levels", "owners", "perks", "entity_link_kinds"])).toEqual([
      "owner-levels",
      "owners",
      "perks",
      "entity-link-kinds",
    ]);
  });

  test("read each segment back as its entity type", () => {
    for (const entityType of ["owner_levels", "owners", "perks", "modifiers", "entity_link_kinds"])
      expect(getEntityTypeOfSegment(getUrlSegment(entityType))).toBe(entityType);
  });
});
