import { BookAptitudes, type BookContents } from "@/codegen/dnd5/tools/seeds/BookAptitudes.ts";
import type { BackgroundSeed } from "@/content/dnd5/builders/backgrounds/types.ts";
import type { ClassSeed } from "@/content/dnd5/builders/classes/types.ts";
import type { FeatSeed } from "@/content/dnd5/builders/feats/types.ts";
import type { Dnd5ItemSeed } from "@/content/dnd5/builders/items/types.ts";
import type { SpeciesSeed } from "@/content/dnd5/builders/species/types.ts";
import { buildCoreFeats } from "@/content/dnd5/data/feats/coreFeats.ts";
import { include } from "@/lib/mixins.ts";
import { CORE_BOOK } from "@/vocabulary/dnd5/books.ts";

import { BaseBookGenerator } from "./BaseBookGenerator.ts";
import BookLayout from "./BookLayout.ts";
import { GeneratesAptitudes } from "./concerns/GeneratesAptitudes.ts";
import { GeneratesClasses } from "./concerns/GeneratesClasses.ts";
import { GeneratesFeats } from "./concerns/GeneratesFeats.ts";
import { GeneratesIndexes } from "./concerns/GeneratesIndexes.ts";
import { GeneratesItems } from "./concerns/GeneratesItems.ts";
import { GeneratesOrigins } from "./concerns/GeneratesOrigins.ts";
import { GeneratesSpells } from "./concerns/GeneratesSpells.ts";

/** A class of the book as its seeds give it: its seed, and the feats its features, subclasses and proficiencies are. */
interface ClassContent {
  feats: FeatSeed[];
  seed: ClassSeed;
}

/**
 * A book's generator, which writes its files from its seeds (`generate`): a step that writes one kind of file is a
 * concern (`concerns/`), on the book's core (`BaseBookGenerator`). What crosses kinds is its own: the pools of tools
 * its classes and backgrounds pick among, which their tools' feats are listed in, and the book's aptitudes, which every
 * kind's seeds name, checked against what its seeds' targets name (`BookAptitudes`).
 */
export class BookGenerator extends include(
  BaseBookGenerator,
  GeneratesAptitudes,
  GeneratesClasses,
  GeneratesFeats,
  GeneratesIndexes,
  GeneratesItems,
  GeneratesOrigins,
  GeneratesSpells,
) {
  /** The book's classes: each class's file and its feats' file, and their indexes. */
  private generateClasses(): ClassContent[] {
    const classes = this.seeds.classes().map((seeds) => ({ seed: seeds.seed(), feats: seeds.feats() }));
    for (const { seed, feats } of classes) this.writeClass(seed, feats);
    this.writeClassIndex(classes.map(({ seed }) => BookLayout.classFile(seed.name)));
    this.writeClassFeatIndex(classes.map(({ seed }) => BookLayout.classFeatsFile(seed.name)));
    return classes;
  }

  /** The book's items' files, mundane and magic, and their index. Its items are returned. */
  private generateItems(): Dnd5ItemSeed[] {
    const items = this.seeds.items();
    const magicItems = this.seeds.magicItems();
    const seeds = [...(items ? this.writeItems(items) : []), ...(magicItems ? this.writeMagicItems(magicItems) : [])];
    this.writeItemIndex();
    return seeds;
  }

  /** The book's species' and backgrounds' files. Their seeds are returned. */
  private generateOrigins(): { backgrounds: BackgroundSeed[]; species: SpeciesSeed[] } {
    const species = this.seeds.species()?.seeds() ?? [];
    const backgrounds = this.seeds.backgrounds()?.seeds() ?? [];
    if (species.length > 0) this.writeSpecies(species);
    if (backgrounds.length > 0) this.writeBackgrounds(backgrounds);
    return { backgrounds, species };
  }

  /**
   * The book's standalone feats' files: its feats by category, its species' traits and lineages, its backgrounds'
   * ability scores and its tools' proficiencies, each tool's listed in the pools of tools that offer it.
   */
  private generateStandaloneFeats(): FeatSeed[] {
    return this.writeFeats({
      byCategory: this.seeds.feats()?.seeds() ?? new Map(),
      species: this.seeds.species()?.feats() ?? [],
      backgrounds: this.seeds.backgrounds()?.feats() ?? [],
      tools: this.seeds.items()?.toolFeats(this.seeds.toolPicks()) ?? [],
    });
  }

  /**
   * The book's files, from its seeds: its classes' (each class's file and its feats'), its standalone feats', its
   * spells', species', backgrounds' and items'; what they make together (its aptitudes, checked against every target
   * its seeds and the core rules' hand-written feats name), and its index; then the files its folder held that it no
   * longer makes are removed.
   */
  generate() {
    const classes = this.generateClasses();
    const standalone = this.generateStandaloneFeats();
    const spells = this.seeds.spells()?.seeds() ?? [];
    if (spells.length > 0) this.writeSpells(spells);
    const { backgrounds, species } = this.generateOrigins();
    const items = this.generateItems();

    const contents: BookContents = {
      backgrounds,
      classes: classes.map(({ seed }) => seed),
      feats: [
        ...classes.flatMap(({ feats }) => feats),
        ...standalone,
        ...(this.book === CORE_BOOK ? buildCoreFeats() : []),
      ],
      items,
      species,
      spells,
    };
    const aptitudes = new BookAptitudes(contents);
    aptitudes.check();
    this.writeAptitudes(aptitudes.names());
    this.writeBookIndex();
    this.folder.removeUnwritten(this.book);
  }
}
