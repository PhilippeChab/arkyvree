import { existsSync, readFileSync } from "node:fs";
import { dirname, relative } from "node:path";

import type { parseCliArgs } from "@/database/packages/dnd35-from-parser/tools/cli/args.ts";
import { BaseGenerator } from "@/database/packages/dnd35-from-parser/tools/generator/BaseGenerator.ts";
import { GeneratesBooks } from "@/database/packages/dnd35-from-parser/tools/generator/concerns/GeneratesBooks.ts";
import { GeneratesClasses } from "@/database/packages/dnd35-from-parser/tools/generator/concerns/GeneratesClasses.ts";
import { GeneratesCopies } from "@/database/packages/dnd35-from-parser/tools/generator/concerns/GeneratesCopies.ts";
import { GeneratesDomains } from "@/database/packages/dnd35-from-parser/tools/generator/concerns/GeneratesDomains.ts";
import { GeneratesFeats } from "@/database/packages/dnd35-from-parser/tools/generator/concerns/GeneratesFeats.ts";
import { GeneratesItems } from "@/database/packages/dnd35-from-parser/tools/generator/concerns/GeneratesItems.ts";
import { GeneratesMagicItems } from "@/database/packages/dnd35-from-parser/tools/generator/concerns/GeneratesMagicItems.ts";
import { GeneratesRaces } from "@/database/packages/dnd35-from-parser/tools/generator/concerns/GeneratesRaces.ts";
import { GeneratesSpells } from "@/database/packages/dnd35-from-parser/tools/generator/concerns/GeneratesSpells.ts";
import { GeneratesWizardSchools } from "@/database/packages/dnd35-from-parser/tools/generator/concerns/GeneratesWizardSchools.ts";
import {
  CORE_BOOK,
  filterReferenceFiles,
  getReferencePath,
  listReferenceBooks,
  listReferenceFiles,
  REFERENCE_DIR,
} from "@/database/packages/dnd35-from-parser/tools/references/files.ts";
import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/references/ReferenceLoader.ts";
import type { ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import type { FeatReference } from "@/database/packages/dnd35-from-parser/tools/types/feats.ts";
import type { SpellReference } from "@/database/packages/dnd35-from-parser/tools/types/spells.ts";
import { include } from "@/server/mixins.ts";

/**
 * Generates the content package's seed data from the references, into `dir`: a step that writes one kind of file is a
 * concern (`concerns/`), and the steps a reference takes, which rewrite the files other kinds share (the aptitudes, the
 * indexes, the core content an extension copies), are its own.
 */
export class Generator extends include(
  BaseGenerator,
  GeneratesBooks,
  GeneratesClasses,
  GeneratesCopies,
  GeneratesDomains,
  GeneratesFeats,
  GeneratesItems,
  GeneratesMagicItems,
  GeneratesRaces,
  GeneratesSpells,
  GeneratesWizardSchools,
) {
  /**
   * A class's files, and what its book's other files take from it: the aptitudes, the core content it copies, the
   * indexes.
   */
  private generateClass(ref: ClassReference, book: string) {
    this.writeClass(ref, book);

    // Regenerate aptitudes.ts for this book (covers books with no standalone feats file)
    this.writeAptitudes(book);

    // Regenerate cowFeats.ts for this book (bonus feat pools from bonusFeatLists)
    this.writeCowFeats(book);

    // Regenerate cowSpells.ts for this book (cross-book spells needing COW)
    this.writeCowSpells(book);

    // Regenerate aggregate index files
    this.writeClassIndex(book);
    this.writeClassFeatIndex(book);
    this.writeFeatIndex(book);

    this.log(`\nDone! Review the generated files and copy to database/packages/dnd35/ when ready.`);
  }

  /** A book's domains, and the aptitudes and the feat index their feat pools add to. */
  private generateDomains(book: string) {
    this.writeDomains(book);

    // Regenerate aptitudes (domain feat pools contribute aptitude names)
    this.writeAptitudes(book);
    this.writeFeatIndex(book);

    this.log(`\nDone!`);
  }

  /** A feat reference's feats, and the aptitudes and the feat index they add to. */
  private generateFeats(ref: FeatReference, book: string) {
    this.writeFeats(ref, book);
    this.writeAptitudes(book);
    this.writeFeatIndex(book);

    this.log(`\nDone! Review the generated file and copy to database/packages/dnd35/ when ready.`);
  }

  /** A spell reference's spells, their index, and every book's copied core spells, which a new spell may change. */
  private generateSpells(ref: SpellReference, book: string) {
    this.writeSpells(ref, book);
    this.writeSpellIndex(book);

    // Regenerate cowSpells.ts for ALL books (new spells in this book may change COW entries elsewhere)
    for (const otherBook of listReferenceBooks()) this.writeCowSpells(otherBook);

    this.log(`\nDone! Review the generated files and copy to database/packages/dnd35/ when ready.`);
  }

  /**
   * Regenerates every reference (of a book, type or name, when given), then each book's domains unless a name picks one
   * reference. A reference that fails doesn't stop the others: the failures are returned.
   */
  generateAll({ bookFilter, typeFilter, nameFilter }: ReturnType<typeof parseCliArgs>): string[] {
    const refs = filterReferenceFiles(listReferenceFiles(), { bookFilter, typeFilter, nameFilter });

    const failures: string[] = [];
    const generate = (path: string, book?: string) => {
      try {
        this.generateReference(path, book);
      } catch (error) {
        failures.push(
          `${relative(REFERENCE_DIR, path)}${book ? ` (${book})` : ""}: ${error instanceof Error ? error.message : error}`,
        );
      }
    };
    // Each book with spells gets its domains file, an empty one when it has no domains reference, and its index
    for (const ref of refs.filter((r) => r.type !== "domain")) generate(ref.path);
    if (typeFilter === "domain" || (!typeFilter && !nameFilter)) {
      for (const book of listReferenceBooks()) {
        if (!existsSync(getReferencePath(book, "spell")) || (bookFilter && book !== bookFilter)) continue;
        try {
          this.generateDomains(book);
          if (book !== CORE_BOOK) this.writeBookIndex(book);
        } catch (error) {
          failures.push(`${book}/domains.json: ${error instanceof Error ? error.message : error}`);
        }
      }
    }
    return failures;
  }

  /** Regenerates a reference's files (into `bookOverride`'s folder, when given), and its book's index. */
  generateReference(jsonPath: string, bookOverride?: string) {
    const meta = JSON.parse(readFileSync(jsonPath, "utf-8"))._meta;
    if (!meta) throw new Error(`Invalid reference file: missing _meta in ${jsonPath}`);
    const book = bookOverride ?? meta.book;

    switch (meta.type) {
      case "class":
        this.generateClass(ReferenceLoader.load(jsonPath, "class"), book);
        break;
      case "feat":
        this.generateFeats(ReferenceLoader.load(jsonPath, "feat"), book);
        break;
      case "spell":
        this.generateSpells(ReferenceLoader.load(jsonPath, "spell"), book);
        break;
      case "wizardSchool":
        this.writeWizardSchools(ReferenceLoader.load(jsonPath, "wizardSchool"), book);
        break;
      case "domain":
        this.generateDomains(book);
        break;
      case "race":
        this.writeRaces(ReferenceLoader.load(jsonPath, "race"), book);
        break;
      case "item":
        this.writeItems(ReferenceLoader.load(jsonPath, "item"), book);
        break;
      case "magicItem":
        this.writeMagicItems(ReferenceLoader.load(jsonPath, "magicItem"), book, dirname(jsonPath));
        break;
      default:
        throw new Error(
          `Unknown type: ${meta.type}. Supported: class, feat, spell, wizardSchool, domain, race, item, magicItem`,
        );
    }
    if (book !== CORE_BOOK) this.writeBookIndex(book);
  }
}
