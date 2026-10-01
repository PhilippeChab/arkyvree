import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { classReferences, readStoredReference, type ReferenceType, resolveReference, type StoredReference } from "@/database/packages/dnd35-from-parser/tools/references.ts";
import { buildMagicItemSeeds, buildRaceSeeds, seededMagicItems, seededRaces } from "@/database/packages/dnd35-from-parser/tools/buildSeeds.ts";
import { buildRaceDetected } from "@/database/packages/dnd35-from-parser/tools/scraper/detectRace.ts";
import { SLOT_OPTIONS } from "@/shared/dnd3.5/items.ts";
import { SIZE_OPTIONS } from "@/shared/enums.ts";
import { checkOneOf, REFERENCE_DIR, referenceBooks } from "@/database/packages/dnd35-from-parser/tools/shared.ts";

describe("A book's class references", () => {
  test("are its classes folder's reference files, sorted (the same on every filesystem), each loaded", () => {
    const files = readdirSync(join(REFERENCE_DIR, "srd", "classes")).filter((file) => file.endsWith(".json")).sort();
    const classes = classReferences("srd");
    expect(classes.map(({ file }) => file)).toEqual(files);
    expect(classes.every(({ ref }) => ref._meta.type === "class" && ref.raw.name.length > 0)).toBe(true);
  });

  test("are none for a book without classes", () => {
    expect(classReferences("a-book-without-classes")).toEqual([]);
  });
});

test("The books with references are their folders, sorted", () => {
  const folders = readdirSync(REFERENCE_DIR, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  expect(referenceBooks()).toEqual(folders.sort());
});

/** A committed reference of `type` as stored. */
const stored = <T extends ReferenceType>(file: string, type: T) => structuredClone(readStoredReference(join(REFERENCE_DIR, file), type));

describe("A loaded reference", () => {
  const FILES: [string, ReferenceType, { detected: boolean; mapping: boolean }][] = [
    ["srd/classes/barbarian.json", "class", { detected: true, mapping: true }],
    ["srd/feats.json", "feat", { detected: true, mapping: true }],
    ["domains.json", "domain", { detected: true, mapping: true }],
    ["srd/races.json", "race", { detected: true, mapping: true }],
    ["srd/items.json", "item", { detected: true, mapping: false }],
    ["srd/magicItems.json", "magicItem", { detected: true, mapping: false }],
    ["srd/spells.json", "spell", { detected: false, mapping: false }],
    ["srd/wizardSchools.json", "wizardSchool", { detected: false, mapping: false }],
  ];

  test("keeps its overrides at the top, as stored, next to what it derives", () => {
    for (const [file, type, derives] of FILES) {
      const reference = stored(file, type);
      const loaded = resolveReference(type, reference);
      expect({ file, overrides: loaded.overrides, detected: "detected" in loaded, mapping: "mapping" in loaded })
        .toEqual({ file, overrides: reference.overrides, ...derives });
    }
  });

  test("sanitizes the overrides of the references it derives from, and keeps a spell's or a wizard school's as stored", () => {
    const edited = <T extends "feat" | "spell" | "wizardSchool">(file: string, type: T) => {
      const reference: StoredReference<T> = stored(file, type);
      const [name] = Object.keys(reference.overrides ?? {}).filter((key) => key !== "reviewed");
      reference.overrides = { ...reference.overrides, [name]: { ...reference.overrides?.[name], description: "It?s \u2019quoted\u2019" } };
      return resolveReference(type, reference).overrides?.[name]?.description;
    };
    expect(edited("srd/feats.json", "feat")).toBe("It's 'quoted'");
    expect(edited("srd/spells.json", "spell")).toBe("It?s \u2019quoted\u2019");
    expect(edited("srd/wizardSchools.json", "wizardSchool")).toBe("It?s \u2019quoted\u2019");
  });
});

describe("A race reference's races", () => {
  test("leave out the ones its overrides skip", () => {
    const reference = stored("srd/races.json", "race");
    const [skipped] = reference.raw;
    reference.overrides = { ...reference.overrides, [skipped.name]: { skip: true } };
    const names = buildRaceSeeds(resolveReference("race", reference)).map(({ name }) => name);
    expect(names).not.toContain(skipped.name);
    expect(names).toHaveLength(reference.raw.length - 1);
  });

  test("have their override's size, else the scraped one, which must be one the seed accepts", () => {
    const reference = stored("srd/races.json", "race");
    // Two races with no size override: the first gets one
    const [first, second] = reference.raw.filter(({ name }) => !reference.overrides?.[name]?.size);
    const size = first.size === "Small" ? "Large" : "Small";
    reference.overrides = { ...reference.overrides, [first.name]: { ...reference.overrides?.[first.name], size } };
    const sizeOf = (name: string) => seededRaces(resolveReference("race", reference)).find((race) => race.name === name)?.size;
    expect(sizeOf(first.name)).toEqual({ ok: true, value: size });
    expect(sizeOf(second.name)).toEqual(checkOneOf(second.size, SIZE_OPTIONS, `${second.name}'s size`));

    reference.overrides = { ...reference.overrides, [first.name]: { size: "Titanic" } };
    expect(sizeOf(first.name)).toEqual({ ok: false, problem: `${first.name}'s size: "Titanic" isn't one of ${SIZE_OPTIONS.join(", ")}` });
    expect(() => buildRaceSeeds(resolveReference("race", reference))).toThrow(`${first.name}'s size`);
  });
});

describe("A race's detected modifiers", () => {
  const race = (name: string, abilityAdjustments: { ability: string; value: number }[], ...features: string[]) =>
    ({ name, description: "", size: "Medium", baseSpeed: 30, abilityAdjustments, features: features.map((feature) => ({ name: feature, description: "" })) });
  const add = (target: string, value: number) => ({ target, operator: "add", value: String(value), valueType: "number" });

  test("are its ability adjustments, and its unconditional skill and save bonuses", () => {
    const detected = buildRaceDetected([
      race("Stout", [{ ability: "Constitution", value: 2 }, { ability: "Luck", value: 1 }],
        "+2 racial bonus on Climb and Jump checks", "+2 racial bonus on Search checks made to notice unusual stonework", "+1 racial bonus on Underwater Basketry checks",
        "+1 racial bonus on all saving throws"),
      race("Hardy", [], "+2 racial bonus on Fortitude saving throws against poison, and a +1 racial bonus on Will saving throws",
        "+1 racial bonus on all saving throws against fear, and a +2 racial bonus on Reflex saving throws",
        "+2 racial bonus on Will saving throws vs. enchantment spells", "+2 racial bonus on Fortitude saving throws for resisting poison",
        "+2 racial bonus on Listen checks if the creature can hear", "+2 racial bonus on Spot checks, while in shadow"),
      race("Twice", [], "+1 racial bonus on Fortitude saving throws and a +2 racial bonus on Will saving throws",
        "+1 racial bonus on all saving throws, and another +1 racial bonus on all saving throws", "+2 racial bonus on Hide checks, to a maximum of +10"),
    ]);
    expect(detected.Stout).toEqual({
      modifiers: [
        add("abilities.constitution.misc", 2), add("skills.climb.misc", 2), add("skills.jump.misc", 2),
        add("saves.fortitude.misc", 1), add("saves.reflex.misc", 1), add("saves.will.misc", 1),
      ],
      unresolvedModifiers: [`Unknown ability: "Luck"`, `Unresolved skill bonus: +1 on "Underwater Basketry"`],
    });
    expect(detected.Hardy).toEqual({ modifiers: [add("saves.will.misc", 1), add("saves.reflex.misc", 2)] });
    // Each bonus of a text, whatever follows a comma but a condition
    expect(detected.Twice).toEqual({
      modifiers: [
        add("saves.fortitude.misc", 1), add("saves.will.misc", 2),
        ...["fortitude", "reflex", "will", "fortitude", "reflex", "will"].map((save) => add(`saves.${save}.misc`, 1)),
        add("skills.hide.misc", 2),
      ],
    });
  });
});

describe("A magic item reference's items", () => {
  test("leave out the ones its overrides skip, and have their override's slot, else the detected one", () => {
    const reference = stored("srd/magicItems.json", "magicItem");
    const loaded = resolveReference("magicItem", reference);
    const [skipped, slotted] = Object.keys(loaded.detected).filter((name) => !reference.overrides?.[name]);
    // A slot the item isn't detected with
    const slot = SLOT_OPTIONS.find((option) => option !== loaded.detected[slotted].slot) ?? "Waist";
    reference.overrides = { ...reference.overrides, [skipped]: { skip: true }, [slotted]: { slot } };
    const items = seededMagicItems(resolveReference("magicItem", reference));
    expect(items.map(({ name }) => name)).not.toContain(skipped);
    expect(items.find(({ name }) => name === slotted)?.slot).toEqual({ ok: true, value: slot });

    // An empty slot is no slot, not a refused one
    reference.overrides = { ...reference.overrides, [slotted]: { slot: "" } };
    expect(seededMagicItems(resolveReference("magicItem", reference)).find(({ name }) => name === slotted)?.slot).toBeUndefined();
    expect(() => buildMagicItemSeeds(resolveReference("magicItem", reference))).not.toThrow();

    reference.overrides = { ...reference.overrides, [slotted]: { slot: "Tail" } };
    const refused = seededMagicItems(resolveReference("magicItem", reference)).find(({ name }) => name === slotted)?.slot;
    expect(refused).toEqual({ ok: false, problem: `${slotted}'s slot: "Tail" isn't one of ${SLOT_OPTIONS.join(", ")}` });
    expect(() => buildMagicItemSeeds(resolveReference("magicItem", reference))).toThrow(`${slotted}'s slot`);
  });
});
