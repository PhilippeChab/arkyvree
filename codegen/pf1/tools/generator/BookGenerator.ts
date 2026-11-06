import { BookAptitudes, type BookContents } from "@/codegen/pf1/tools/seeds/BookAptitudes.ts";
import type { ClassSeed } from "@/content/pf1/builders/classes/types.ts";
import type { FeatSeed } from "@/content/pf1/builders/feats/types.ts";
import { buildCoreFeats } from "@/content/pf1/data/feats/coreFeats.ts";
import { include } from "@/lib/mixins.ts";
import { CORE_BOOK } from "@/vocabulary/pf1/books.ts";

import { BaseBookGenerator } from "./BaseBookGenerator.ts";
import BookLayout from "./BookLayout.ts";
import { GeneratesAptitudes } from "./concerns/GeneratesAptitudes.ts";
import { GeneratesClasses } from "./concerns/GeneratesClasses.ts";
import { GeneratesDomains } from "./concerns/GeneratesDomains.ts";
import { GeneratesFeats } from "./concerns/GeneratesFeats.ts";
import { GeneratesIndexes } from "./concerns/GeneratesIndexes.ts";
import { GeneratesItems } from "./concerns/GeneratesItems.ts";
import { GeneratesRaces } from "./concerns/GeneratesRaces.ts";
import { GeneratesSpells } from "./concerns/GeneratesSpells.ts";

/** A class of the book as its seeds give it: its seed, its features' feats, its bonus feat lists that name their feats. */
interface ClassContent {
  bonusFeatLists: { aptitude: string; feats: string[] }[];
  feats: FeatSeed[];
  seed: ClassSeed;
}

/**
 * A book's generator, which writes its files from its seeds (`generate`): a step that writes one kind of file is a
 * concern (`concerns/`), on the book's core (`BaseBookGenerator`). What crosses kinds is its own: the aptitude a
 * class's bonus feat list gives the feats it names, and the book's aptitudes, which every kind's seeds name.
 */
export class BookGenerator extends include(
  BaseBookGenerator,
  GeneratesAptitudes,
  GeneratesClasses,
  GeneratesDomains,
  GeneratesFeats,
  GeneratesIndexes,
  GeneratesItems,
  GeneratesRaces,
  GeneratesSpells,
) {
  /**
   * The book's classes and standalone feats (`feats`), each feat a class's bonus feat list names given that list's
   * aptitude, a standalone feat's or a class's: a name that's no feat of the book refuses it.
   */
  private addBonusFeatLists(classes: ClassContent[], feats: FeatSeed[]) {
    const known = new Set([...feats, ...classes.flatMap((content) => content.feats)].map(({ name }) => name));
    const added = new Map<string, string[]>();
    for (const { seed, bonusFeatLists } of classes) {
      for (const { aptitude, feats: names } of bonusFeatLists) {
        for (const name of names) {
          if (!known.has(name)) throw new Error(`${seed.name}'s ${aptitude} names "${name}", which no feat is`);
          added.set(name, [...(added.get(name) ?? []), aptitude]);
        }
      }
    }
    const withAdded = (feat: FeatSeed): FeatSeed => {
      const aptitudes = added.get(feat.name);
      return aptitudes ? { ...feat, aptitudes: [...new Set([...feat.aptitudes, ...aptitudes])] } : feat;
    };
    return {
      classes: classes.map((content) => ({ ...content, feats: content.feats.map(withAdded) })),
      feats: feats.map(withAdded),
    };
  }

  /** The book's classes, as their seeds give them. */
  private classContents(): ClassContent[] {
    return this.seeds.classReferences().map((ref) => {
      const seeds = this.seeds.classes(ref);
      return { seed: seeds.seed(), feats: seeds.classFeats(), bonusFeatLists: seeds.bonusFeatLists() };
    });
  }

  /**
   * What the book's seeds are, of every kind that names an aptitude: `classes` and `feats` as written, and for the core
   * rules their hand-written feats (`buildCoreFeats`: the arcane schools, the favored enemies…), seeded beside them.
   */
  private contents(classes: ClassContent[], feats: FeatSeed[]): BookContents {
    const domainRef = this.seeds.reference("domain");
    const itemRef = this.seeds.reference("item");
    const magicItemRef = this.seeds.reference("magicItem");
    const raceRef = this.seeds.reference("race");
    const spellRef = this.seeds.reference("spell");
    return {
      classes: classes.map(({ seed }) => seed),
      domains: domainRef ? this.seeds.domains(domainRef).seeds() : [],
      feats: [
        ...feats,
        ...classes.flatMap((content) => content.feats),
        ...(this.book === CORE_BOOK ? buildCoreFeats() : []),
      ],
      items: [
        ...Object.values(itemRef ? this.seeds.items(itemRef).seeds() : {}).flat(),
        ...Object.values(magicItemRef ? this.seeds.magicItems(magicItemRef).seeds() : {}).flat(),
      ],
      races: raceRef ? this.seeds.races(raceRef).seeds() : [],
      spells: spellRef ? this.seeds.spells(spellRef).seeds() : [],
    };
  }

  /** The book's files of each kind of its references but its classes and feats: spells, domains, races, items. */
  private writeReferenceFiles() {
    const spellRef = this.seeds.reference("spell");
    if (spellRef) this.writeSpells(spellRef);
    const domainRef = this.seeds.reference("domain");
    if (domainRef) this.writeDomains(domainRef);
    const raceRef = this.seeds.reference("race");
    if (raceRef) this.writeRaces(raceRef);
    const itemRef = this.seeds.reference("item");
    if (itemRef) this.writeItems(itemRef);
    const magicItemRef = this.seeds.reference("magicItem");
    if (magicItemRef) this.writeMagicItems(magicItemRef);
  }

  /**
   * The book's files, from its seeds: its classes' (each class's file and its feats'), its standalone feats', each of
   * its other references' (its spells', domains', races', items' and magic items'), and what they make together (its
   * aptitudes, its copies, its indexes, which list what was written, and its index); then the files its folder held
   * that it no longer makes are removed.
   */
  generate() {
    const featRef = this.seeds.reference("feat");
    const standalone = featRef ? this.seeds.feats(featRef).seeds() : [];
    const { classes, feats } = this.addBonusFeatLists(this.classContents(), standalone);
    for (const { seed, feats: classFeats } of classes) this.writeClass(seed, classFeats);
    if (featRef || classes.length > 0) this.writeFeatIndex(featRef ? this.writeFeats(feats) : []);
    this.writeReferenceFiles();

    this.writeAptitudes(new BookAptitudes(this.contents(classes, feats)).names());
    this.writeCopies();
    this.writeClassIndex(classes.map(({ seed }) => BookLayout.classFile(seed.name)));
    this.writeClassFeatIndex(classes.map(({ seed }) => BookLayout.classFeatsFile(seed.name)));
    this.writeItemIndex();
    this.writeBookIndex();
    this.folder.removeUnwritten(this.book);
  }
}
