import { describe, expect, test } from "bun:test";

import StorageEngine from "@/engine/api/StorageEngine.ts";
import { Field, type Fields } from "@/engine/core/fields/index.ts";
import { DND35_STORAGE } from "@/engine/rulesets/dnd3.5/storage/Dnd35Storage.ts";
import { BONDED_KIND_SLUGS, PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd3.5/bondedKinds.ts";
import {
  CHARACTER_AGE,
  CHARACTER_ALIGNMENT,
  CHARACTER_DEITY,
  CHARACTER_FIELDS,
  CHARACTER_GENDER,
  CHARACTER_HEIGHT,
  CHARACTER_WEIGHT,
  CHARACTER_XP,
  ENTITY_FIELDS,
} from "@/vocabulary/dnd3.5/fields/index.ts";

describe("3.5's storage", () => {
  test("declares its feats, items, spells, races, classes and their levels customizable", () => {
    expect(StorageEngine.shared().customizableKinds()).toEqual([
      ...["class-levels", "classes", "feats", "items", "races", "spells"],
    ]);
  });

  test("declares its player character's kind, which a new race or class is for", () => {
    expect(StorageEngine.shared().playerKinds()).toEqual([PLAYER_CHARACTER_KIND]);
    expect(StorageEngine.shared().isPlayerKind(PLAYER_CHARACTER_KIND)).toBe(true);
    for (const slug of BONDED_KIND_SLUGS) expect(StorageEngine.shared().isPlayerKind(slug)).toBe(false);
    expect([DND35_STORAGE.kinds.races.partition, DND35_STORAGE.kinds.classes.partition]).toEqual([
      PLAYER_CHARACTER_KIND,
      PLAYER_CHARACTER_KIND,
    ]);
  });

  test("defines each field once, as its vocabulary declares it of its entities and its characters, its kind and set as stored", () => {
    const { fieldDefs } = DND35_STORAGE.registries;
    const defined = fieldDefs.map(
      ({ field, multiple, ownerType, valueKind }) => `${ownerType} ${field} ${valueKind}${multiple ? "[]" : ""}`,
    );
    expect(new Set(fieldDefs.map(({ field, ownerType }) => `${ownerType} ${field}`)).size).toBe(fieldDefs.length);
    const owners: [string, Fields][] = [...Object.entries(ENTITY_FIELDS), ["characters", CHARACTER_FIELDS]];
    const vocabulary = owners.flatMap(([ownerType, fields]) =>
      Field.storedLeavesOf(fields).map((leaf) => {
        const { multiple, valueKind } = Field.storedKindOf(leaf);
        return `${ownerType} ${leaf.field} ${valueKind}${multiple ? "[]" : ""}`;
      }),
    );
    expect(defined).toEqual(vocabulary);
    // A character's: its identity's texts, its experience and its age numbers, each a single value
    expect(defined.filter((def) => def.startsWith("characters "))).toEqual([
      `characters ${CHARACTER_ALIGNMENT} text`,
      `characters ${CHARACTER_XP} number`,
      `characters ${CHARACTER_DEITY} text`,
      `characters ${CHARACTER_AGE} number`,
      `characters ${CHARACTER_GENDER} text`,
      `characters ${CHARACTER_HEIGHT} text`,
      `characters ${CHARACTER_WEIGHT} text`,
    ]);
    // A ruleset's are its own, a character's its, every other owner's an entity's
    const kindOf = (ownerType: string) =>
      ownerType === "rulesets" ? "ruleset" : ownerType === "characters" ? "character" : "entity";
    expect(fieldDefs.filter(({ ownerKind, ownerType }) => ownerKind !== kindOf(ownerType))).toEqual([]);
  });
});
