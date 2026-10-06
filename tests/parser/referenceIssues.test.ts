import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { discoverRefs, REFERENCE_DIR } from "@/database/packages/dnd35-from-parser/tools/referenceFiles.ts";
import { referenceIssues } from "@/database/packages/dnd35-from-parser/tools/referenceIssues.ts";
import { readStoredReference } from "@/database/packages/dnd35-from-parser/tools/references.ts";
import { isRecord } from "@/shared/isRecord.ts";

const folders: string[] = [];

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
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

describe("parser:validate", () => {
  test("reports a race size the seed refuses, and a seeded race's unreviewed detections", () => {
    const issues = issuesOf("srd/races.json", (overrides) => {
      overrides.reviewed = [];
      overrides.Elf = { ...(isRecord(overrides.Elf) ? overrides.Elf : {}), size: "Titanic" };
    });
    expect(issues).toContainEqual({
      kind: "not seedable",
      entityName: "Elf",
      text: expect.stringContaining(`Elf's size: "Titanic"`),
    });
    expect(issues).toContainEqual({
      kind: "modifier",
      entityName: "Gnome",
      text: expect.stringContaining("Craft (alchemy)"),
    });
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
    expect(issues).toEqual([
      { kind: "not seedable", entityName: item, text: expect.stringContaining(`${item}'s slot: "Tail"`) },
    ]);
  });

  test("reports what a domain's list lacks: a spell no parsed book has, a level without a spell, a spell its book puts on it", () => {
    const issues = issuesOf("complete-divine/domains.json", (overrides) => {
      overrides.Pestilence = {
        ...(isRecord(overrides.Pestilence) ? overrides.Pestilence : {}),
        spells: [
          { level: 1, name: "Doom" },
          { level: 2, name: "Summon Swarm" },
          { level: 3, name: "Contagion" },
          { level: 4, name: "Poison" },
          { level: 5, name: "Plague of Rats" },
          { level: 6, name: "Curse of Lycanthropy" },
          { level: 7, name: "Scourge" },
          { level: 8, name: "Create Greatest Undead" },
        ],
      };
    });
    expect(issues).toEqual([
      {
        kind: "not seedable",
        entityName: "Pestilence",
        text: "Create Greatest Undead (level 8) is no spell of the core rules or the book",
      },
      { kind: "not seedable", entityName: "Pestilence", text: "no spell at level 9" },
      {
        kind: "not seedable",
        entityName: "Pestilence",
        text: "the book's Otyugh Swarm is Pestilence 9, not on its list",
      },
    ]);
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
    expect(issuesOf("complete-warrior/classes/stonelord.json", clear)).toEqual([
      { kind: "prereq", entityName: "Stonelord", text: expect.stringContaining("arduous ritual") },
    ]);
    const feats = issuesOf("complete-divine/feats.json", clear);
    expect(feats.map(({ kind, entityName }) => `${kind} ${entityName}`)).toEqual([
      "modifier Divine Spell Power",
      "modifier Oaken Resilience",
      "modifier Wolverine's Rage",
    ]);
  });

  test.each([
    "srd/classes/monk.json",
    "srd/feats.json",
    "srd/domains.json",
    "srd/races.json",
    "srd/items.json",
    "srd/magicItems.json",
    "srd/spells.json",
    "srd/wizardSchools.json",
  ])("reports an entry of %s's review list that covers no issue", (file) => {
    const issues = issuesOf(file, (overrides) => {
      overrides.reviewed = [
        ...(Array.isArray(overrides.reviewed) ? overrides.reviewed : []),
        "An issue since resolved",
      ];
    });
    expect(issues).toEqual([{ kind: "stale review", entityName: undefined, text: "An issue since resolved" }]);
  });

  test("counts an entity's review entries as used when it's skipped or reviewed by name, and reports a name without issues", () => {
    const craft = `Unresolved skill bonus: +2 on "Craft (alchemy)"`;
    expect(issuesOf("srd/races.json", (overrides) => void (overrides.reviewed = ["Gnome", craft]))).toEqual([]);
    expect(
      issuesOf("srd/races.json", (overrides) => {
        overrides.reviewed = ["Gnome", craft];
        overrides.Gnome = { ...(isRecord(overrides.Gnome) ? overrides.Gnome : {}), skip: true };
      }),
    ).toEqual([]);
    expect(issuesOf("srd/races.json", (overrides) => void (overrides.reviewed = [craft, "Elf"]))).toEqual([
      { kind: "stale review", entityName: undefined, text: "Elf" },
    ]);
    // A skipped entity without issues has none for its name to cover either
    expect(
      issuesOf("srd/races.json", (overrides) => {
        overrides.reviewed = [craft, "Elf"];
        overrides.Elf = { ...(isRecord(overrides.Elf) ? overrides.Elf : {}), skip: true };
      }),
    ).toEqual([{ kind: "stale review", entityName: undefined, text: "Elf" }]);
  });

  test("reports a review entry that repeats one, once", () => {
    const craft = `Unresolved skill bonus: +2 on "Craft (alchemy)"`;
    const stale = (text: string) => ({ kind: "stale review" as const, entityName: undefined, text });
    expect(issuesOf("srd/races.json", (overrides) => void (overrides.reviewed = [craft, craft]))).toEqual([
      stale(craft),
    ]);
    expect(
      issuesOf("srd/races.json", (overrides) => void (overrides.reviewed = [craft, "Resolved", "Resolved"])),
    ).toEqual([stale("Resolved")]);
  });

  test("reports a reference of a type the tools don't read", () => {
    const folder = mkdtempSync(join(tmpdir(), "references-"));
    folders.push(folder);
    writeFileSync(
      join(folder, "potions.json"),
      JSON.stringify({ _meta: { type: "potion", sourceUrl: "", book: "srd", scrapedAt: "" }, raw: [] }),
    );
    expect(referenceIssues(discoverRefs(folder)).map(({ kind, text }) => ({ kind, text }))).toEqual([
      { kind: "unknown type", text: "potion" },
    ]);
  });

  test("reads a review entry as the scraper stores text: a curly quote or a double space is the plain one", () => {
    let edited = 0;
    const issues = issuesOf("complete-divine/feats.json", (overrides) => {
      overrides.reviewed = (Array.isArray(overrides.reviewed) ? overrides.reviewed : []).map((entry: unknown) => {
        if (typeof entry !== "string" || !entry.includes("you'd")) return entry;
        edited++;
        return entry.replace("you'd", "you’d").replace("turn or", "turn  or");
      });
    });
    expect(edited).toBe(1);
    expect(issues).toEqual([]);
    // A spell reference's list too, whose entries are all stale
    expect(issuesOf("srd/spells.json", (overrides) => void (overrides.reviewed = ["It’s  resolved"]))).toEqual([
      { kind: "stale review", entityName: undefined, text: "It's resolved" },
    ]);
  });

  test("reports a class table's column no modifier reads, unless the class maps it or reviews it", () => {
    const unread = (edit: (overrides: Record<string, unknown>) => void) =>
      issuesOf("srd/classes/monk.json", edit)
        .filter(({ kind }) => kind === "unread column")
        .map(({ entityName, text }) => `${entityName}: ${text}`);
    expect(unread(() => {})).toEqual([]);
    expect(unread((overrides) => void (overrides.reviewed = []))).toEqual(["Monk: Flurry BAB"]);
    expect(unread((overrides) => void delete overrides.columns)).toEqual([
      "Monk: AC Bonus",
      "Monk: Unarmed Damage",
      "Monk: Unarmored Speed Bonus",
    ]);
  });

  test("reports an item without a definition, which the generator leaves out, unless reviewed", () => {
    const undefinedSickle = (overrides: Record<string, unknown>) =>
      void (overrides.nameMap = { ...(isRecord(overrides.nameMap) ? overrides.nameMap : {}), Sickle: "Laser sickle" });
    expect(issuesOf("srd/items.json", undefinedSickle)).toEqual([
      { kind: "unresolved item", entityName: undefined, text: "weapon: Sickle" },
    ]);
    expect(
      issuesOf("srd/items.json", (overrides) => {
        undefinedSickle(overrides);
        overrides.reviewed = ["weapon: Sickle"];
      }),
    ).toEqual([]);
    expect(
      issuesOf("srd/items.json", (overrides) => {
        undefinedSickle(overrides);
        overrides.Sickle = { ...(isRecord(overrides.Sickle) ? overrides.Sickle : {}), skip: true };
      }),
    ).toEqual([]);
  });
});
