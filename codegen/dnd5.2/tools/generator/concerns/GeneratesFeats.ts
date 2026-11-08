import { type BaseBookGenerator } from "@/codegen/dnd5.2/tools/generator/BaseBookGenerator.ts";
import BookLayout, { type BookFile } from "@/codegen/dnd5.2/tools/generator/BookLayout.ts";
import { CodeFile } from "@/codegen/dnd5.2/tools/generator/code/CodeFile.ts";
import type { FeatCategory } from "@/codegen/dnd5.2/tools/terms/feats.ts";
import type { FeatSeed } from "@/content/dnd5.2/builders/feats/types.ts";
import type { Constructor } from "@/lib/mixins.ts";

/** A book's standalone feats: its feats by category, and its species', backgrounds' and tools' feats. */
export interface StandaloneFeats {
  backgrounds: FeatSeed[];
  byCategory: Map<FeatCategory, FeatSeed[]>;
  species: FeatSeed[];
  tools: FeatSeed[];
}

/** Generating a book's standalone feats: its feats file, a list per category, its other feats' files and their index. */
export function GeneratesFeats<B extends Constructor<BaseBookGenerator>>(Base: B) {
  abstract class GeneratingFeats extends Base {
    /** The book's feats file (feats/feats.ts): a list per category, of its feats. The lists it exports, if it has feats. */
    private writeCategories(byCategory: Map<FeatCategory, FeatSeed[]>): string[] {
      if (byCategory.size === 0) return [];
      const file = new CodeFile();
      for (const [category, feats] of byCategory) {
        file.list(
          BookLayout.categoryList(category),
          "FeatSeed",
          feats.flatMap((feat) => file.feat(feat)),
        );
      }
      this.write(BookLayout.featsFile, file.code());
      return [...byCategory.keys()].map((category) => BookLayout.categoryList(category));
    }

    /** One of the book's other feats files (`file`): its list, if it has feats. */
    private writeFeatList({ path, list }: BookFile, feats: FeatSeed[]): boolean {
      if (feats.length === 0) return false;
      this.writeList(path, list, "FeatSeed", feats, (file, feat) => file.feat(feat));
      return true;
    }

    /**
     * The book's standalone feats' files (its feats file's lists per category, its species', backgrounds' and tools'
     * feats) and their index (feats/index.ts). The feats written are returned.
     */
    writeFeats({ backgrounds, byCategory, species, tools }: StandaloneFeats): FeatSeed[] {
      const lists = [{ path: BookLayout.featsFile, lists: this.writeCategories(byCategory) }];
      const others: [BookFile, FeatSeed[]][] = [
        [BookLayout.featFiles.backgrounds, backgrounds],
        [BookLayout.featFiles.species, species],
        [BookLayout.featFiles.tools, tools],
      ];
      for (const [file, feats] of others)
        if (this.writeFeatList(file, feats)) lists.push({ path: file.path, lists: [file.list] });
      const index = new CodeFile();
      index.featIndex(lists.filter(({ lists: written }) => written.length > 0));
      this.write(BookLayout.files.standaloneFeats.path, index.code());
      const written = [...[...byCategory.values()].flat(), ...backgrounds, ...species, ...tools];
      this.log(`Built ${written.length} standalone feats`);
      return written;
    }
  }
  return GeneratingFeats;
}
