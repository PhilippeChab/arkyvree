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

  test("holds fields past their columns in its customizable kinds, its skills and its rulesets", () => {
    expect(StorageEngine.shared().fieldOwners().toSorted()).toEqual([
      ...["class_levels", "classes", "feats", "items", "races", "rulesets", "skills", "spells"],
    ]);
  });

  test("declares its player character's kind, which a new race or class is for", () => {
    expect(StorageEngine.shared().playerKinds()).toEqual([PLAYER_CHARACTER_KIND]);
    expect([DND35_STORAGE.kinds.races.partition, DND35_STORAGE.kinds.classes.partition]).toEqual([
      PLAYER_CHARACTER_KIND,
      PLAYER_CHARACTER_KIND,
    ]);
  });

  test("defines each field once, as its vocabulary, its kinds' own fields and its character's declare it", () => {
    const { fieldDefs } = DND35_STORAGE.registries;
    const defined = fieldDefs.map(({ field, ownerType, valueKind }) => `${ownerType} ${field} ${valueKind}`);
    expect(new Set(fieldDefs.map(({ field, ownerType }) => `${ownerType} ${field}`)).size).toBe(fieldDefs.length);
    const vocabulary = Object.entries(ENTITY_FIELDS).flatMap(([ownerType, fields]) =>
      Field.leavesOf(fields).flatMap((leaf) => (leaf.kind === "ref" ? [] : [`${ownerType} ${leaf.field}`])),
    );
    const own = Object.entries(DND35_STORAGE.kinds).flatMap(([ownerType, kind]) =>
      Object.entries(kind.fields ?? {}).map(([field, { kind: valueKind }]) => `${ownerType} ${field} ${valueKind}`),
    );
    const character = Object.values(CHARACTER_FIELDS).map(({ field, kind }) => `characters ${field} ${kind}`);
    expect(
      defined.filter((def) => !own.includes(def) && !character.includes(def)).map((def) => def.replace(/ \w+$/, "")),
    ).toEqual(vocabulary);
    expect(defined.filter((def) => own.includes(def) || character.includes(def)).toSorted()).toEqual(
      [...own, ...character].toSorted(),
    );
  });
});
