import { PcgenFile } from "@/engine/core/imports/index.ts";
import type { CharacterImporter, ImportOwner, ImportPlan } from "@/engine/core/module/index.ts";
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
   * What importing the character the file holds writes, and the report of it: refused when the file is of another game
   * mode (a Pathfinder character), whose rules aren't 3.5's.
   */
  planImport(view: RulesetView, text: string, owner: ImportOwner): ImportPlan {
    const gameMode = PcgenFile.gameModeOf(text);
    if (gameMode && gameMode !== GAME_MODE) {
      throw new RulesError(
        "unprocessable",
        `This file is a character of PCGen's ${gameMode} game mode: this ruleset imports 3.5 characters`,
      );
    }
    const imported = new PcgenFile(text).read();
    const planned = new PcgenImport(view, imported, owner).plan();
    if ("plan" in planned) return planned.plan;
    // A level a level-up refuses even forced stops the levels: planned again without it and those after it
    const replanned = new PcgenImport(view, imported, owner, planned.refused).plan();
    if ("plan" in replanned) return replanned.plan;
    throw new RulesError("unprocessable", replanned.refused.reason);
  }

  /** Whether a file is one PCGen saved. */
  reads(text: string): boolean {
    return PcgenFile.reads(text);
  }
}
