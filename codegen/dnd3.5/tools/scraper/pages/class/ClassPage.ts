/**
 * A class's page on dndtools.net:
 *   <h2>Site Tagline</h2>                    ← the site's frame
 *   <h2>Class Name</h2>
 *   <h4>Hit die</h4> <p>d10</p>
 *   <h4>Skill points</h4> <p>4 + Int</p>
 *   <h4>Class Skills</h4> <table> (skill rows with links)
 *   <h4>Requirements</h4> (prestige classes)
 *   <h4>Class Features</h4> <p><strong>Feature Name (Ex):</strong> description</p>
 *   <table> (Level/BAB/Fort/Ref/Will/Special, spells per day)
 */

import { DndToolsPage } from "@/codegen/dnd3.5/tools/scraper/pages/DndToolsPage.ts";
import { type ClassReference } from "@/codegen/dnd3.5/tools/types/classes.ts";
import { include } from "@/lib/mixins.ts";

import { ReadsFeatures } from "./concerns/ReadsFeatures.ts";
import { ReadsPrerequisites } from "./concerns/ReadsPrerequisites.ts";
import { ReadsProgression } from "./concerns/ReadsProgression.ts";
import { ReadsSkills } from "./concerns/ReadsSkills.ts";
import { ReadsSummary } from "./concerns/ReadsSummary.ts";

/**
 * A class's page on dndtools.net, read a part per concern (`concerns/`): its summary (name, description, hit die,
 * skill points, alignment, bonus spells' ability), its skills, its prerequisites, its tables and its features.
 */
export class ClassPage extends include(
  DndToolsPage,
  ReadsFeatures,
  ReadsPrerequisites,
  ReadsProgression,
  ReadsSkills,
  ReadsSummary,
) {
  /**
   * The class, as its reference stores it. The readings run in this order: the tables' drop their cells' footnote
   * markers (<sup>) from the page, which the features, the spells known and the bonus spells' ability read without.
   */
  read(): ClassReference["raw"] {
    const name = this.name();
    const description = this.description();
    const hitDie = this.hitDie();
    const skillPointsPerLevel = this.skillPoints();
    const classSkills = this.skills();
    const prerequisites = this.prerequisites();
    const alignment = this.alignment();
    const { progression, hasCantrips } = this.progression();
    const classFeatures = this.features(progression);
    const spellsKnown = this.spellsKnown();
    const bonusSpellAbility = this.bonusSpellAbility();

    if (alignment && !prerequisites.parsed.alignment) prerequisites.parsed.alignment = alignment;

    return {
      name,
      description,
      hitDie,
      skillPointsPerLevel,
      classSkills,
      prerequisites,
      progression,
      classFeatures,
      ...(spellsKnown.length > 0 ? { spellsKnown } : {}),
      ...(hasCantrips ? { hasCantrips } : {}),
      ...(bonusSpellAbility ? { bonusSpellAbility } : {}),
    };
  }
}
