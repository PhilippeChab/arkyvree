import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import type { ImportOwner, ImportPlan } from "./plans.ts";

/**
 * A program's importer: whether a file is one it reads (the program that saved it says so in it), and what importing
 * the character it holds into a ruleset's view writes.
 */
export interface CharacterImporter {
  planImport(view: RulesetView, text: string, owner: ImportOwner): ImportPlan;
  /** The program whose files it reads (`PCGen`) */
  readonly program: string;
  reads(text: string): boolean;
}

/**
 * What a ruleset answers of a character imported from another program's file: its rules decide which importers exist
 * (`importers`, a program's each, in the order they're tried), and the file says which program saved it, which picks
 * the importer that reads it.
 */
export default abstract class ImportsPart {
  /** The importers the ruleset's rules offer, in the order they're tried: the first that reads a file imports it. */
  protected abstract readonly importers: readonly CharacterImporter[];

  /** The programs whose files the ruleset imports, in the order they're tried. */
  describeImporters(): { programs: string[] } {
    return { programs: this.importers.map((importer) => importer.program) };
  }

  /**
   * What importing the character a file holds (`text`) as `owner`'s writes, by the importer that reads it: refused,
   * naming the programs the ruleset reads, when none does.
   */
  planImport(view: RulesetView, text: string, owner: ImportOwner): ImportPlan {
    const importer = this.importers.find((candidate) => candidate.reads(text));
    if (!importer) {
      const programs = this.importers.map((candidate) => candidate.program).join(", ");
      throw new RulesError("unprocessable", `No importer reads this file: this ruleset imports files from ${programs}`);
    }
    return importer.planImport(view, text, owner);
  }
}
