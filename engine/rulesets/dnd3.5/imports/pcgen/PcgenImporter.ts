import { PcgenFile } from "@/engine/core/imports/index.ts";
import type { CharacterImporter, ImportDetection, ImportOwner, ImportPlan } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

import PcgenImport from "./PcgenImport.ts";

/** PCGen's game mode of the 3.5 rules, which a file of the 3.5 rules names (`GAMEMODE:35e`). */
const GAME_MODE = "35e";

/**
 * PCGen's importer of a 3.5 character: a file PCGen saved (it opens on `PCGVERSION:` and names its `VERSION:`), of its
 * 3.5 game mode, read by its format's reader (`PcgenFile`), then matched in the ruleset (`PcgenImport`).
 */
export default class PcgenImporter implements CharacterImporter {
  readonly program = "PCGen";

  /**
   * What a file is, when PCGen saved it: its format, the PCGen version and its character's game mode; refused when
   * its format has no reader yet, or its character is of another game mode (a Pathfinder character), whose rules
   * aren't 3.5's.
   */
  detect(text: string): ImportDetection | undefined {
    if (!PcgenFile.reads(text)) return undefined;
    const source = { program: this.program, ...PcgenFile.describe(text) };
    if (!PcgenFile.readsFormat(source.format))
      return { refusal: `PCGen's character file format ${source.format || "(unnamed)"} isn't read yet`, source };
    if (source.rules && source.rules !== GAME_MODE) {
      const refusal = `This file is a character of PCGen's ${source.rules} game mode: a 3.5 ruleset imports its ${GAME_MODE} characters`;
      return { refusal, source };
    }
    return { source };
  }

  /** What importing the character the file holds writes, and the report of it. */
  planImport(view: RulesetView, text: string, owner: ImportOwner): ImportPlan {
    const imported = new PcgenFile(text).read();
    const planned = new PcgenImport(view, imported, owner).plan();
    if ("plan" in planned) return planned.plan;
    // A level a level-up refuses even forced stops the levels: planned again without it and those after it
    const replanned = new PcgenImport(view, imported, owner, planned.refused).plan();
    if ("plan" in replanned) return replanned.plan;
    throw new RulesError("unprocessable", replanned.refused.reason);
  }
}
