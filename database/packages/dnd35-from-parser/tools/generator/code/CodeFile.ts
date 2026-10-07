import { include } from "@/server/mixins.ts";

import { BaseCodeFile } from "./BaseCodeFile.ts";
import { WritesClasses } from "./concerns/WritesClasses.ts";
import { WritesCopies } from "./concerns/WritesCopies.ts";
import { WritesDomains } from "./concerns/WritesDomains.ts";
import { WritesFeats } from "./concerns/WritesFeats.ts";
import { WritesIndexes } from "./concerns/WritesIndexes.ts";
import { WritesItems } from "./concerns/WritesItems.ts";
import { WritesRaces } from "./concerns/WritesRaces.ts";
import { WritesSpells } from "./concerns/WritesSpells.ts";
import { WritesWizardSchools } from "./concerns/WritesWizardSchools.ts";

/**
 * A generated file's code, as it's written (`BaseCodeFile`: its lines, its imports, the customization values every
 * seed writes alike), each kind of seed by a concern of its own (`concerns/`): a class, a feat and a template family's
 * feats, an item, a spell, a race, a domain, a wizard school, what a book copies, and a book's indexes.
 */
export class CodeFile extends include(
  BaseCodeFile,
  WritesClasses,
  WritesCopies,
  WritesDomains,
  WritesFeats,
  WritesIndexes,
  WritesItems,
  WritesRaces,
  WritesSpells,
  WritesWizardSchools,
) {}
