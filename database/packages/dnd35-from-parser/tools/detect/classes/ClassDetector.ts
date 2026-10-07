import { type Resolved } from "@/database/packages/dnd35-from-parser/tools/detect/BaseDetector.ts";
import { ClassPrerequisites } from "@/database/packages/dnd35-from-parser/tools/detect/readers/requirements/ClassPrerequisites.ts";
import { type ClassReference } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";
import { include } from "@/server/mixins.ts";

import { BaseClassDetector } from "./BaseClassDetector.ts";
import { ClassMapping } from "./ClassMapping.ts";
import { AptitudePicks } from "./concerns/AptitudePicks.ts";
import { BonusFeatLists } from "./concerns/BonusFeatLists.ts";
import {
  readBab,
  readCasterAdvancement,
  readCasterType,
  readHitDie,
  readSaves,
  readSkillPoints,
  readSpellsKnown,
  readSpellsPerDay,
} from "./progression.ts";

/**
 * A class reference's detector: what its page gives (`detected`), read by its concerns (`concerns/`: the features
 * where its player picks, the existing feats it lets them pick) and its table's readers (`progression.ts`), and the
 * entities it makes (`mapping`, a `ClassMapping`), its overrides applied.
 */
export class ClassDetector extends include(BaseClassDetector, AptitudePicks, BonusFeatLists) {
  /** The class's detected section. */
  protected detected(): ClassReference["detected"] {
    const { raw } = this;
    const { requirements, errors, unresolved } = new ClassPrerequisites(raw.prerequisites.parsed);
    const spellsPerDay = readSpellsPerDay(raw.progression);
    const spellsKnown = readSpellsKnown(raw);
    const hasOwnSpells = spellsPerDay !== undefined;

    return {
      hd: readHitDie(raw.hitDie),
      levels: raw.progression.length,
      skillPoints: readSkillPoints(raw.skillPointsPerLevel),
      bab: readBab(raw.progression),
      saves: readSaves(raw.progression),
      casterLevelAdvancement: readCasterAdvancement(raw.progression),
      requirements,
      featureOccurrences: this.featureOccurrences,
      ...this.aptitudePicks(),
      ...this.bonusFeatLists(),
      ...this.lockedFavoredEnemies(),
      ...(spellsPerDay ? { spellsPerDay } : {}),
      ...(spellsKnown ? { spellsKnown } : {}),
      ...(hasOwnSpells ? { hasOwnSpells } : {}),
      ...(hasOwnSpells ? readCasterType(raw) : {}),
      ...(errors.length > 0 ? { errors } : {}),
      ...(unresolved.length > 0 ? { unresolvedPrereqs: unresolved } : {}),
    };
  }

  /** The class's entities, a `ClassMapping`'s: what's detected and scraped, its overrides applied. */
  protected mapping(detected: ClassReference["detected"]): ClassReference["mapping"] {
    return new ClassMapping(this, detected).build();
  }

  /**
   * The reference with what's derived from it (`BaseDetector.resolve`), its raw the one the class is read from: its
   * alignment filled in from its overrides when its page names none.
   */
  resolve(): Resolved<ClassReference> {
    return { ...super.resolve(), raw: this.raw };
  }
}
