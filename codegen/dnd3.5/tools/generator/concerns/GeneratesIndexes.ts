import { dirname, join } from "node:path";

import { type BaseBookGenerator } from "@/codegen/dnd3.5/tools/generator/BaseBookGenerator.ts";
import BookLayout from "@/codegen/dnd3.5/tools/generator/BookLayout.ts";
import { CodeFile } from "@/codegen/dnd3.5/tools/generator/code/CodeFile.ts";
import type { Constructor } from "@/lib/mixins.ts";

/**
 * Generating a book's indexes, which list its files (`CodeFile`'s `WritesIndexes`): its classes', its class feats',
 * its standalone feats', its spells' and its items', and the book's own index. An index lists the files the generator
 * wrote of the book, or those its references make.
 */
export function GeneratesIndexes<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingIndexes extends Base {
    /**
     * The book's index (index.ts): its content, as its package seeds it (the core rules' with what they add), each
     * part a file the generator wrote of it, an empty list when it wrote none.
     */
    writeBookIndex() {
      const file = new CodeFile();
      file.bookIndex(BookLayout.parts.filter((part) => this.wrote(part.file.path)));
      this.write(BookLayout.files.index.path, file.code());
    }

    /** The book's class feats' index (feats/classes/index.ts): each of its classes' feats file, from its references. */
    writeClassFeatIndex() {
      const files = this.seeds
        .classReferences()
        .map(({ ref }) => BookLayout.classFeatsFile(ref.raw.name))
        .sort((a, b) => (a.path < b.path ? -1 : 1));
      if (files.length === 0) return;

      const file = new CodeFile();
      file.classFeatIndex(files);
      this.write(BookLayout.files.classFeats.path, file.code());
    }

    /** The book's classes' index (classes/index.ts): each of its classes' file, from its references, by reference. */
    writeClassIndex() {
      const files = this.seeds
        .classReferences()
        .filter(({ ref }) => ref.raw?.name)
        .map(({ ref }) => BookLayout.classFile(ref.raw.name));
      if (files.length === 0) return;

      const file = new CodeFile();
      file.classIndex(files);
      this.write(BookLayout.files.classes.path, file.code());
    }

    /** The book's standalone feats' index (feats/index.ts): every list of its feats files, from its references. */
    writeFeatIndex() {
      const featRef = this.seeds.reference("feat");
      // Each feats file's lists, by file, as the generator writes them: the domains' feat pools', the reference's
      const feats = featRef && this.seeds.feats(featRef);
      const domainRef = this.seeds.reference("domain");
      const { domainFeats } = BookLayout.files;
      const files = [
        {
          path: domainFeats.path,
          lists: domainRef && this.seeds.domains(domainRef).poolFeats().length > 0 ? [domainFeats.list] : [],
        },
        {
          path: BookLayout.featsFile,
          lists: feats
            ? [
                ...[...feats.byType().keys()].map((type) => BookLayout.featTypeList(type)),
                ...feats.templates().map(({ familyName }) => BookLayout.templateList(familyName)),
              ]
            : [],
        },
      ].filter(({ lists }) => lists.length > 0);
      // A book with classes has a feats folder, its standalone feats none or not
      if (files.length === 0 && this.seeds.classReferences().length === 0) return;

      const file = new CodeFile();
      file.featIndex(files);
      this.write(BookLayout.files.standaloneFeats.path, file.code());
    }

    /** The book's items' index (items/index.ts): every item file the generator wrote of it, mundane or magic. */
    writeItemIndex() {
      const folder = dirname(BookLayout.itemsIndex);
      const files = BookLayout.itemFiles.filter(({ path }) => this.wrote(join(folder, path)));
      if (files.length === 0) return;

      const file = new CodeFile();
      file.itemIndex(files);
      this.write(BookLayout.itemsIndex, file.code());
    }

    /**
     * The book's spells' index (spells/index.ts): each spell level file the generator wrote, its spells at its level.
     */
    writeSpellIndex() {
      // The spell level files the generator wrote (cantrips.ts, level1.ts…), by level
      const files = BookLayout.spellLevels
        .map((level) => ({ level, ...BookLayout.spellFile(level) }))
        .filter(({ path }) => this.wrote(path));
      if (files.length === 0) return;

      const file = new CodeFile();
      file.spellIndex(files);
      this.write(BookLayout.files.spells.path, file.code());
    }
  }
  return GeneratingIndexes;
}
