import { describe, expect, test } from "bun:test";

import StorageEngine from "@/engine/api/StorageEngine.ts";

describe("3.5's storage", () => {
  test("declares its feats, items, spells, races, classes and their levels customizable", () => {
    expect(StorageEngine.shared().customizableKinds().toSorted()).toEqual([
      ...["class_levels", "classes", "feats", "items", "races", "spells"],
    ]);
  });

  test("holds fields in the properties of its customizable kinds, its skills and its rulesets", () => {
    expect(StorageEngine.shared().propertyTypes().toSorted()).toEqual([
      ...["class_levels", "classes", "feats", "items", "races", "rulesets", "skills", "spells"],
    ]);
  });
});
