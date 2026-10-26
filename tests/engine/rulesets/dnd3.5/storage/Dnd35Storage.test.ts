import { describe, expect, test } from "bun:test";

import StorageEngine from "@/engine/api/StorageEngine.ts";
import { Field } from "@/engine/core/fields/index.ts";
import { CHARACTER_FIELDS } from "@/engine/rulesets/dnd3.5/characters/CharacterValues.ts";
import { DND35_STORAGE } from "@/engine/rulesets/dnd3.5/storage/Dnd35Storage.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd3.5/bondedKinds.ts";
import { ENTITY_FIELDS } from "@/vocabulary/dnd3.5/fields/index.ts";

describe("3.5's storage", () => {
  test("declares its feats, items, spells, races, classes and their levels customizable", () => {
    expect(StorageEngine.shared().customizableKinds().toSorted()).toEqual([
      ...["class_levels", "classes", "feats", "items", "races", "spells"],
    ]);
  });

  test("holds fields in its customizable kinds, its skills, its languages and its rulesets", () => {
    expect(StorageEngine.shared().fieldOwners().toSorted()).toEqual([
      ...["class_levels", "classes", "feats", "items", "languages", "races", "rulesets", "skills", "spells"],
    ]);
  });

  test("declares its player character's kind, which a new race or class is for", () => {
    expect(StorageEngine.shared().playerKinds()).toEqual([PLAYER_CHARACTER_KIND]);
    expect([DND35_STORAGE.kinds.races.partition, DND35_STORAGE.kinds.classes.partition]).toEqual([
      PLAYER_CHARACTER_KIND,
      PLAYER_CHARACTER_KIND,
    ]);
  });

  test("defines each field once, as its vocabulary and its character's declare it, its kind and set as stored", () => {
    const { fieldDefs } = DND35_STORAGE.registries;
    const defined = fieldDefs.map(
      ({ field, multiple, ownerType, valueKind }) => `${ownerType} ${field} ${valueKind}${multiple ? "[]" : ""}`,
    );
    expect(new Set(fieldDefs.map(({ field, ownerType }) => `${ownerType} ${field}`)).size).toBe(fieldDefs.length);
    const vocabulary = Object.entries(ENTITY_FIELDS).flatMap(([ownerType, fields]) =>
      Field.storedLeavesOf(fields).map((leaf) => {
        const { multiple, valueKind } = Field.storedKindOf(leaf);
        return `${ownerType} ${leaf.field} ${valueKind}${multiple ? "[]" : ""}`;
      }),
    );
    const character = Object.entries(CHARACTER_FIELDS).map(([field, { kind }]) => `characters ${field} ${kind}`);
    expect(defined).toEqual([...vocabulary, ...character]);
    // A ruleset's are its own, a character's its, every other owner's an entity's
    const kindOf = (ownerType: string) =>
      ownerType === "rulesets" ? "ruleset" : ownerType === "characters" ? "character" : "entity";
    expect(fieldDefs.filter(({ ownerKind, ownerType }) => ownerKind !== kindOf(ownerType))).toEqual([]);
  });
});
