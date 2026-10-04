import { describe, expect, test } from "bun:test";

import { getEntityTypeOfSegment, getUrlSegment, getUrlSegments } from "@/shared/urlSegments.ts";

describe("URL segments", () => {
  test("say class where the code says klass, and name every other entity type by itself", () => {
    expect(getUrlSegments(["klass_levels", "klasses", "feats", "skills"])).toEqual([
      "class-levels",
      "classes",
      "feats",
      "skills",
    ]);
  });

  test("read each segment back as its entity type", () => {
    for (const entityType of ["klass_levels", "klasses", "feats", "modifiers"]) {
      expect(getEntityTypeOfSegment(getUrlSegment(entityType))).toBe(entityType);
    }
  });
});
