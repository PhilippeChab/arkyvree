import { include } from "@/lib/mixins.ts";

import { BaseCodeFile } from "./BaseCodeFile.ts";
import { WritesBackgrounds } from "./concerns/WritesBackgrounds.ts";
import { WritesClasses } from "./concerns/WritesClasses.ts";
import { WritesFeats } from "./concerns/WritesFeats.ts";
import { WritesIndexes } from "./concerns/WritesIndexes.ts";
import { WritesItems } from "./concerns/WritesItems.ts";
import { WritesSpecies } from "./concerns/WritesSpecies.ts";
import { WritesSpells } from "./concerns/WritesSpells.ts";

/**
 * A generated file's code, as it's written (`BaseCodeFile`: its lines, its imports, the customization values every
 * seed writes alike), each kind of seed by a concern of its own (`concerns/`): a background, a class, a feat, an item,
 * a species, a spell, and a book's indexes.
 */
export class CodeFile extends include(
  BaseCodeFile,
  WritesBackgrounds,
  WritesClasses,
  WritesFeats,
  WritesIndexes,
  WritesItems,
  WritesSpecies,
  WritesSpells,
) {}
