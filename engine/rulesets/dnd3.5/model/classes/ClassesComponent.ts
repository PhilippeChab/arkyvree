import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { StoredAdvancement } from "@/engine/core/module/index.ts";
import type { RulesetView, ViewLink } from "@/engine/core/view/index.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import type {
  CustomizedClassLevel,
  HeldFeat,
  HeldSpell,
  SkillPick,
} from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Klass, KlassLevel } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { stripSeparators } from "@/shared/text.ts";

interface ClassesData {
  [key: string]: {
    bonuscasterlevel: number;
    /** Its class skills: its `classSkill` links */
    classSkillLinks: ViewLink[];
    klass: Klass;
    level: number;
    levels: {
      advancement: StoredAdvancement;
      classLevel: CustomizedClassLevel;
      feats: HeldFeat[];
      skills: SkillPick[];
      spells: HeldSpell[];
    }[];
  };
}

/** A character's classes: each one's levels, with what each level picked, and the ruleset's other classes at level 0. */
export default class ClassesComponent extends CharacterComponent<LoadedCharacterData> {
  private readonly classes: ClassesData = {};

  /** Each class the character has levels in, its levels sorted with their picks, and the ruleset's others at level 0. */
  override initialize(
    {
      advancements,
      classSkillLinks,
      feats,
      classes,
      classLevels,
      spells,
      skills,
    }: Pick<
      LoadedCharacterData,
      "advancements" | "classSkillLinks" | "feats" | "classes" | "classLevels" | "spells" | "skills"
    >,
    { rulesetData }: RulesetView,
  ) {
    const classLevelsById = new Map(classLevels.map((level) => [level.id, level]));
    const classesById = new Map(classes.map((klass) => [klass.id, klass]));
    const classSkillLinksByClass = Map.groupBy(classSkillLinks, (link) => link.fromId);
    // What each level holds, by its advancement: the picks and grants the character loaded are all at a level
    const featsByLevel = Map.groupBy(feats, (feat) => feat.advancementId);
    const skillsByLevel = Map.groupBy(skills, (skill) => skill.advancementId);
    const spellsByLevel = Map.groupBy(spells, (spell) => spell.advancementId);

    for (const advancement of advancements) {
      const classLevel = classLevelsById.get(advancement.entryId);
      if (!classLevel) throw new Error("Class level not found");

      const klass = classesById.get(classLevel.ownerId);
      if (!klass) throw new Error("Class not found");

      const className = stripSeparators(klass.name);
      if (!this.classes[className]) {
        this.classes[className] = {
          klass,
          classSkillLinks: classSkillLinksByClass.get(klass.id) ?? [],
          levels: [],
          level: 0,
          bonuscasterlevel: 0,
        };
      }

      this.classes[className].levels.push({
        classLevel,
        advancement,
        feats: featsByLevel.get(advancement.id) ?? [],
        skills: skillsByLevel.get(advancement.id) ?? [],
        spells: spellsByLevel.get(advancement.id) ?? [],
      });
    }

    for (const klass of Object.values(this.classes)) {
      klass.levels.sort((a, b) => a.classLevel.position - b.classLevel.position);
      klass.level = klass.levels.length;
    }

    // Add level-0 entries for ruleset classes the character doesn't have
    for (const klass of Dnd35View.of(rulesetData).classes) {
      const className = stripSeparators(klass.name);
      if (!this.classes[className]) {
        this.classes[className] = {
          klass,
          classSkillLinks: [],
          levels: [],
          level: 0,
          bonuscasterlevel: 0,
        };
      }
    }
  }

  addProjectedLevel(className: string, classLevel: KlassLevel, advancement: StoredAdvancement): void {
    const entry = this.classes[className];
    if (!entry) return;

    entry.levels.push({
      classLevel: { ...classLevel, modifiers: [], requirements: [] },
      advancement,
      feats: [],
      skills: [],
      spells: [],
    });
    entry.level++;
  }

  getCharacterClasses(): ClassesData {
    return Object.fromEntries(Object.entries(this.classes).filter(([, klass]) => klass.level > 0));
  }

  getClasses(): ClassesData {
    return this.classes;
  }

  removeProjectedLevel(className: string): void {
    const entry = this.classes[className];
    if (!entry || entry.levels.length === 0) return;

    entry.levels.pop();
    entry.level--;
  }
}
