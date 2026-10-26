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
      feats: HeldFeat[];
      klassLevel: CustomizedClassLevel;
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
      klasses,
      klassLevels,
      spells,
      skills,
    }: Pick<
      LoadedCharacterData,
      "advancements" | "classSkillLinks" | "feats" | "klasses" | "klassLevels" | "spells" | "skills"
    >,
    { rulesetData }: RulesetView,
  ) {
    const klassLevelsById = new Map(klassLevels.map((level) => [level.id, level]));
    const klassesById = new Map(klasses.map((klass) => [klass.id, klass]));
    const classSkillLinksByClass = Map.groupBy(classSkillLinks, (link) => link.fromId);
    // What each level holds, by its advancement: the picks and grants the character loaded are all at a level
    const featsByLevel = Map.groupBy(feats, (feat) => feat.advancementId);
    const skillsByLevel = Map.groupBy(skills, (skill) => skill.advancementId);
    const spellsByLevel = Map.groupBy(spells, (spell) => spell.advancementId);

    for (const advancement of advancements) {
      const klassLevel = klassLevelsById.get(advancement.trackId!);
      if (!klassLevel) throw new Error("Class level not found");

      const klass = klassesById.get(klassLevel.ownerId);
      if (!klass) throw new Error("Class not found");

      const klassName = stripSeparators(klass.name);
      if (!this.classes[klassName]) {
        this.classes[klassName] = {
          klass,
          classSkillLinks: classSkillLinksByClass.get(klass.id) ?? [],
          levels: [],
          level: 0,
          bonuscasterlevel: 0,
        };
      }

      this.classes[klassName].levels.push({
        klassLevel,
        advancement,
        feats: featsByLevel.get(advancement.id) ?? [],
        skills: skillsByLevel.get(advancement.id) ?? [],
        spells: spellsByLevel.get(advancement.id) ?? [],
      });
    }

    for (const klass of Object.values(this.classes)) {
      klass.levels.sort((a, b) => a.klassLevel.position - b.klassLevel.position);
      klass.level = klass.levels.length;
    }

    // Add level-0 entries for ruleset classes the character doesn't have
    for (const klass of Dnd35View.of(rulesetData).klasses) {
      const klassName = stripSeparators(klass.name);
      if (!this.classes[klassName]) {
        this.classes[klassName] = {
          klass,
          classSkillLinks: [],
          levels: [],
          level: 0,
          bonuscasterlevel: 0,
        };
      }
    }
  }

  addProjectedLevel(klassName: string, klassLevel: KlassLevel, advancement: StoredAdvancement): void {
    const entry = this.classes[klassName];
    if (!entry) return;

    entry.levels.push({
      klassLevel: { ...klassLevel, modifiers: [], requirements: [] },
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

  removeProjectedLevel(klassName: string): void {
    const entry = this.classes[klassName];
    if (!entry || entry.levels.length === 0) return;

    entry.levels.pop();
    entry.level--;
  }
}
