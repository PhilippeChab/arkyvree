import { include } from "@/lib/mixins.ts";

import { BaseBookGenerator } from "./BaseBookGenerator.ts";
import { GeneratesClasses } from "./concerns/GeneratesClasses.ts";
import { GeneratesCopies } from "./concerns/GeneratesCopies.ts";
import { GeneratesDomains } from "./concerns/GeneratesDomains.ts";
import { GeneratesFeats } from "./concerns/GeneratesFeats.ts";
import { GeneratesIndexes } from "./concerns/GeneratesIndexes.ts";
import { GeneratesItems } from "./concerns/GeneratesItems.ts";
import { GeneratesRaces } from "./concerns/GeneratesRaces.ts";
import { GeneratesSpells } from "./concerns/GeneratesSpells.ts";
import { GeneratesWizardSchools } from "./concerns/GeneratesWizardSchools.ts";

/**
 * A book's generator, which writes its files from its seeds (`generate`): a step that writes one kind of file is a
 * concern (`concerns/`), on the book's core (`BaseBookGenerator`).
 */
export class BookGenerator extends include(
  BaseBookGenerator,
  GeneratesClasses,
  GeneratesCopies,
  GeneratesDomains,
  GeneratesFeats,
  GeneratesIndexes,
  GeneratesItems,
  GeneratesRaces,
  GeneratesSpells,
  GeneratesWizardSchools,
) {
  /**
   * The book's files, from its seeds: each of its references' (its classes', its feats', its spells' and its domains'
   * (a book with spells has a domains file, an empty one when it has no domains reference), its races', its wizard
   * schools', its items' and its magic items'), and what they make together (its aptitudes, what it copies from the
   * core rules, its indexes, which list what was written, and its index); then the files its folder held that it no
   * longer makes are removed.
   */
  generate() {
    const classes = this.seeds.classReferences();
    const featRef = this.seeds.reference("feat");
    const spellRef = this.seeds.reference("spell");
    for (const { ref } of classes) this.writeClass(ref);
    if (featRef) this.writeFeats(featRef);
    if (spellRef) {
      this.writeSpells(spellRef);
      this.writeDomains();
    }
    const raceRef = this.seeds.reference("race");
    if (raceRef) this.writeRaces(raceRef);
    const wizardSchoolRef = this.seeds.reference("wizardSchool");
    if (wizardSchoolRef) this.writeWizardSchools(wizardSchoolRef);
    const itemRef = this.seeds.reference("item");
    if (itemRef) this.writeItems(itemRef);
    const magicItemRef = this.seeds.reference("magicItem");
    if (magicItemRef) this.writeMagicItems(magicItemRef);

    // What its classes, feats and domains make together
    if (classes.length > 0 || featRef || spellRef) {
      this.writeAptitudes();
      this.writeFeatIndex();
    }
    this.writeCowFeats();
    this.writeCowSpells();
    this.writeClassIndex();
    this.writeClassFeatIndex();
    this.writeSpellIndex();
    this.writeItemIndex();
    this.writeBookIndex();
    this.folder.removeUnwritten(this.book);
  }
}
