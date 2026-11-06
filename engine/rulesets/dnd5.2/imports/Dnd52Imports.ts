import { ImportsPart } from "@/engine/core/module/index.ts";

/**
 * The Pathfinder imports: none yet. The PCGen importer reads PCGen's D&D 3.5 files, whose skills, feats and items aren't
 * Pathfinder's; a Pathfinder ruleset imports no file until an importer of PCGen's Pathfinder game mode reads them.
 */
export default class Dnd52Imports extends ImportsPart {
  protected override readonly importers = [];
}
