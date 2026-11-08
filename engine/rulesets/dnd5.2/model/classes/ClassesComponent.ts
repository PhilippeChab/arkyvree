import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { StoredAdvancement } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd5.2/model/loading/DetailedCharacterDataLoader.ts";
import type {
  CustomizedClassLevel,
  HeldFeat,
  HeldSpell,
} from "@/engine/rulesets/dnd5.2/model/loading/loadedEntities.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";
import type { Klass, KlassLevel } from "@/engine/rulesets/dnd5.2/view/rows.ts";
import { stripSeparators } from "@/shared/text.ts";
import { PROFICIENCY_BONUS_BY_LEVEL } from "@/vocabulary/dnd5.2/classes.ts";

interface ClassesData {
  [key: string]: {
    klass: Klass;
    level: number;
    levels: {
      advancement: StoredAdvancement;
      classLevel: CustomizedClassLevel;
      feats: HeldFeat[];
      spells: HeldSpell[];
    }[];
  };
}

/**
 * A character's classes: each one's levels, with what each level picked, and the ruleset's other classes at level 0.
 */
export default class ClassesComponent extends CharacterComponent<LoadedCharacterData> {
  private readonly classes: ClassesData = {};

  /** What modifiers add to the Proficiency Bonus past its level's (an Ioun Stone of Mastery's +1): the sheet's input. */
  private proficiencyMisc = 0;

  /** Each class the character has levels in, its levels sorted with their picks, and the ruleset's others at level 0. */
  override initialize(
    {
      advancements,
      feats,
      classes,
      classLevels,
      spells,
    }: Pick<LoadedCharacterData, "advancements" | "feats" | "classes" | "classLevels" | "spells">,
    { rulesetData }: RulesetView,
  ) {
    const classLevelsById = new Map(classLevels.map((level) => [level.id, level]));
    const classesById = new Map(classes.map((klass) => [klass.id, klass]));
    // What each level holds, by its advancement: the picks and grants the character loaded are all at a level
    const featsByLevel = Map.groupBy(feats, (feat) => feat.advancementId);
    const spellsByLevel = Map.groupBy(spells, (spell) => spell.advancementId);

    for (const advancement of advancements) {
      const classLevel = classLevelsById.get(advancement.entryId);
      if (!classLevel) throw new Error("Class level not found");

      const klass = classesById.get(classLevel.ownerId);
      if (!klass) throw new Error("Class not found");

      const className = stripSeparators(klass.name);
      this.classes[className] ??= { klass, levels: [], level: 0 };
      this.classes[className].levels.push({
        classLevel,
        advancement,
        feats: featsByLevel.get(advancement.id) ?? [],
        spells: spellsByLevel.get(advancement.id) ?? [],
      });
    }

    for (const klass of Object.values(this.classes)) {
      klass.levels.sort((a, b) => a.classLevel.position - b.classLevel.position);
      klass.level = klass.levels.length;
    }

    // Add level-0 entries for ruleset classes the character doesn't have
    for (const klass of Dnd52View.of(rulesetData).classes)
      this.classes[stripSeparators(klass.name)] ??= { klass, levels: [], level: 0 };
  }

  addProjectedLevel(className: string, classLevel: KlassLevel, advancement: StoredAdvancement): void {
    const entry = this.classes[className];
    if (!entry) return;

    entry.levels.push({
      classLevel: { ...classLevel, modifiers: [], requirements: [] },
      advancement,
      feats: [],
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

  /** The character's Proficiency Bonus: its level's (`getProficiencyByLevel`) and what modifiers add to it. */
  getProficiencyBonus(): number {
    return this.getProficiencyByLevel() + this.proficiencyMisc;
  }

  /**
   * The Proficiency Bonus of the character's level (`getTotalLevel`), as the Character Advancement table gives it: a
   * character before its first level has its first level's.
   */
  getProficiencyByLevel(): number {
    const level = Math.min(Math.max(this.getTotalLevel(), 1), PROFICIENCY_BONUS_BY_LEVEL.length);
    return PROFICIENCY_BONUS_BY_LEVEL[level - 1];
  }

  /** What modifiers add to the Proficiency Bonus past its level's (`combat.proficiency.misc`). */
  getProficiencyMisc(): number {
    return this.proficiencyMisc;
  }

  /** The character's level: every class's levels together, what its Proficiency Bonus is by. */
  getTotalLevel(): number {
    return Object.values(this.classes).reduce((total, klass) => total + klass.level, 0);
  }

  removeProjectedLevel(className: string): void {
    const entry = this.classes[className];
    if (!entry || entry.levels.length === 0) return;

    entry.levels.pop();
    entry.level--;
  }

  /** Sets what modifiers add to the Proficiency Bonus (`combat.proficiency.misc`, which a modifier writes). */
  setProficiencyMisc(value: number): void {
    this.proficiencyMisc = value;
  }
}
