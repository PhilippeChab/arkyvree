import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { readStoredReference } from "@/database/packages/dnd35-from-parser/tools/references.ts";
import { discoverRefs, REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/shared.ts";
import { referenceIssues } from "@/database/packages/dnd35-from-parser/tools/validate.ts";
import { isRecord } from "@/shared/isRecord.ts";

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/**
 * The issues parser:validate reports of a committed reference whose overrides `edit` changes, as a hand edit of its
 * file would, in a folder of its own.
 */
function issuesOf(file: string, edit: (overrides: Record<string, unknown>) => void) {
  const reference: unknown = JSON.parse(readFileSync(join(REFERENCE_DIR, file), "utf8"));
  if (!isRecord(reference)) throw new Error(`${file} isn't a reference`);
  const overrides = isRecord(reference.overrides) ? reference.overrides : {};
  edit(overrides);
  reference.overrides = overrides;
  const folder = mkdtempSync(join(tmpdir(), "references-"));
  folders.push(folder);
  mkdirSync(dirname(join(folder, file)), { recursive: true });
  writeFileSync(join(folder, file), JSON.stringify(reference));
  return referenceIssues(discoverRefs(folder)).map(({ kind, entityName, text }) => ({ kind, entityName, text }));
}

describe("parser:validate", () => {
  test("reports a race size the seed refuses, and a seeded race's unreviewed detections", () => {
    const issues = issuesOf("srd/races.json", (overrides) => {
      overrides.reviewed = [];
      overrides.Elf = { ...isRecord(overrides.Elf) ? overrides.Elf : {}, size: "Titanic" };
    });
    expect(issues).toContainEqual({ kind: "not seedable", entityName: "Elf", text: expect.stringContaining(`Elf's size: "Titanic"`) });
    expect(issues).toContainEqual({ kind: "modifier", entityName: "Gnome", text: expect.stringContaining("Craft (alchemy)") });
  });

  test("leaves out a skipped race: it isn't seeded", () => {
    const issues = issuesOf("srd/races.json", (overrides) => {
      overrides.reviewed = [];
      overrides.Gnome = { skip: true, size: "Titanic" };
    });
    expect(issues.filter(({ entityName }) => entityName === "Gnome")).toEqual([]);
  });

  test("reports a magic item slot the seed refuses", () => {
    const stored = readStoredReference(join(REFERENCE_DIR, "srd/magicItems.json"), "magicItem");
    const [item] = stored.raw.map(({ name }) => name).filter((name) => !stored.overrides?.[name]);
    const issues = issuesOf("srd/magicItems.json", (overrides) => {
      overrides[item] = { slot: "Tail" };
    });
    expect(issues).toEqual([{ kind: "not seedable", entityName: item, text: expect.stringContaining(`${item}'s slot: "Tail"`) }]);
  });

  test("finds no issue in the committed references", () => {
    expect(referenceIssues(discoverRefs())).toEqual([]);
  });

  test("reports what a reference's review list covers, once cleared: a class's aptitude picks and prerequisites, feats' modifiers", () => {
    const clear = (overrides: Record<string, unknown>) => void (overrides.reviewed = []);
    expect(issuesOf("complete-adventurer/classes/animalLord.json", clear)).toEqual([
      { kind: "aptitude pick", entityName: "Animal Lord", text: "Animal Bond" },
      { kind: "aptitude pick", entityName: "Animal Lord", text: "Third Totem" },
    ]);
    expect(issuesOf("complete-warrior/classes/stonelord.json", clear)).toEqual([{ kind: "prereq", entityName: "Stonelord", text: expect.stringContaining("arduous ritual") }]);
    const feats = issuesOf("complete-divine/feats.json", clear);
    expect(feats.map(({ kind, entityName }) => `${kind} ${entityName}`))
      .toEqual(["modifier Divine Spell Power", "modifier Oaken Resilience", "modifier Swim like a Fish", "modifier Swim like a Fish", "modifier Wolverine's Rage"]);
  });
});
