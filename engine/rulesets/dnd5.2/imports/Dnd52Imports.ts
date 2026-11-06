import { ImportsPart } from "@/engine/core/module/index.ts";

/**
 * The D&D 5th Edition imports: none yet. The PCGen importer reads PCGen's D&D 3.5 files, whose skills, feats and items
 * aren't the 2024 rules'; a 5th Edition ruleset imports no file until an importer reads a 5th Edition character.
 */
export default class Dnd52Imports extends ImportsPart {
  protected override readonly importers = [];
}
