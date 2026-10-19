import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import type { ImportDetection, ImportOwner, ImportPlan } from "./plans.ts";

/**
 * A program's importer: what it makes of a file (`detect`: none when another program saved it; the file, and why it
 * can't import it when it can't, as the file says), and what importing the character it holds into a ruleset's view
 * writes.
 */
export interface CharacterImporter {
  detect(text: string): ImportDetection | undefined;
  planImport(view: RulesetView, text: string, owner: ImportOwner): ImportPlan;
  /** The program whose files it reads (`PCGen`) */
  readonly program: string;
}

/**
 * What a ruleset answers of a character imported from another program's file: its rules decide which importers exist
 * (`importers`, a program's each, in the order they're tried), and the file says which program saved it, its version
 * and its character's rules, which pick the importer that reads it.
 */
export default abstract class ImportsPart {
  /** Why a file no importer recognizes isn't imported: the programs whose files are (`programs`). */
  static describeUnrecognized(programs: string[]): string {
    return `This isn't a character file the app imports: it imports ${programs.join(", ")}'s`;
  }

  /** The importers the ruleset's rules offer, in the order they're tried: the first that recognizes a file reads it. */
  protected abstract readonly importers: readonly CharacterImporter[];

  /** The first importer, in order, that recognizes a file (`text`), and what it makes of it. */
  private recognize(text: string) {
    for (const importer of this.importers) {
      const detection = importer.detect(text);
      if (detection) return { detection, importer };
    }
    return undefined;
  }

  /** The programs whose files the ruleset imports, in the order they're tried. */
  describeImporters(): { programs: string[] } {
    return { programs: this.importers.map((importer) => importer.program) };
  }

  /**
   * What the first importer that recognizes a file (`text`) makes of it: the file as it says it, and why the importer
   * can't import it when it can't; none when no importer recognizes it.
   */
  detect(text: string): ImportDetection | undefined {
    return this.recognize(text)?.detection;
  }

  /**
   * What importing the character a file holds (`text`) as `owner`'s writes, by the importer that recognizes it:
   * refused with why when it can't import it, and naming the programs the ruleset reads when none recognizes it.
   */
  planImport(view: RulesetView, text: string, owner: ImportOwner): ImportPlan {
    const recognized = this.recognize(text);
    if (!recognized)
      throw new RulesError("unprocessable", ImportsPart.describeUnrecognized(this.describeImporters().programs));

    if (recognized.detection.refusal) throw new RulesError("unprocessable", recognized.detection.refusal);
    return recognized.importer.planImport(view, text, owner);
  }
}
