import { basename } from "node:path";

import type { ReferenceFile } from "@/codegen/dnd3.5/tools/types/reference.ts";

import References from "./References.ts";

/** An override `parser:dnd3.5:overrides` lists: an entry's or a class's, the keys it sets, and where it is. */
export interface OverrideEntry {
  book: string;
  entryName: string;
  keys: string[];
  /** A feat's prerequisites, as its page gives them */
  prereqText?: string;
  /** Its reference file's name ("feats", "barbarian") */
  refName: string;
  refType: string;
}

/**
 * A reference file's overrides, which `parser:dnd3.5:overrides` lists, every type's: a class's keys, or each entry's (a
 * feat's with its prerequisites' text; an item's renaming, `nameMap`, among its keys), but those that only reword a
 * description, and the review list.
 */
export class ReferenceOverrides {
  constructor(private readonly file: ReferenceFile) {}

  /** The overrides of the reference files `files` (`References.files`), each file's in turn. */
  static of(files: ReferenceFile[]): OverrideEntry[] {
    return files.flatMap((file) => new ReferenceOverrides(file).list());
  }

  /** A class's: the keys its overrides set, its features' when one changes more than its description. */
  private classOverrides(): OverrideEntry[] {
    const { overrides, raw } = References.stored(this.file.path, "class");
    const keys = Object.keys(overrides ?? {}).filter((key) => {
      if (key === "reviewed" || key === "description") return false;
      if (key !== "features") return true;
      return Object.values(overrides?.features ?? {}).some((feature) =>
        Object.keys(feature).some((field) => field !== "description"),
      );
    });
    return keys.length === 0 ? [] : [{ ...this.where(), entryName: raw.name, keys }];
  }

  /**
   * The entries whose overrides change more than their description: each entry's keys, an item's renaming (`nameMap`,
   * by its scraped name) among them, and a feat's prerequisites' text (`prereqText`).
   */
  private entryOverrides(
    overrides: Record<string, object> | undefined,
    prereqText: (name: string) => string | undefined = () => undefined,
  ): OverrideEntry[] {
    const { reviewed: _reviewed, nameMap = {}, ...entries } = overrides ?? {};
    const keysByName = new Map(
      Object.entries(entries).map(([name, override]) => [
        name,
        Object.keys(override).filter((key) => key !== "description"),
      ]),
    );
    for (const name of Object.keys(nameMap)) keysByName.set(name, [...(keysByName.get(name) ?? []), "nameMap"]);
    return [...keysByName].flatMap(([name, keys]) =>
      keys.length === 0 ? [] : [{ ...this.where(), entryName: name, keys, prereqText: prereqText(name) }],
    );
  }

  /** Where its overrides are: its book, its type and its file's name. */
  private where(): Pick<OverrideEntry, "book" | "refName" | "refType"> {
    return { book: this.file.book, refType: this.file.type, refName: basename(this.file.path, ".json") };
  }

  /** Its overrides, by its type: none for a type the tools don't read (`parser:dnd3.5:validate` reports it). */
  list(): OverrideEntry[] {
    switch (this.file.type) {
      case "class":
        return this.classOverrides();
      case "feat": {
        const { overrides, raw } = References.stored(this.file.path, "feat");
        return this.entryOverrides(overrides, (name) => raw.find((feat) => feat.name === name)?.prerequisiteText);
      }
      case "domain":
      case "item":
      case "magicItem":
      case "race":
      case "spell":
      case "wizardSchool":
        return this.entryOverrides(References.stored(this.file.path, this.file.type).overrides);
      default:
        return [];
    }
  }
}
