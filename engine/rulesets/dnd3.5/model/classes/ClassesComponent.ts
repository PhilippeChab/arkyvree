import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { StoredAdvancement } from "@/engine/core/module/index.ts";
import type { RulesetView, ViewLink } from "@/engine/core/view/index.ts";
import type {
  LoadedCharacterData,
  SkillWithRank,
} from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import type {
  CustomizedClassLevel,
  CustomizedFeat,
  CustomizedSpell,
} from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Klass, KlassLevel } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import { stripSeparators } from "@/shared/text.ts";

interface ClassesData {
  [key: string]: {
    bonuscasterlevel: number;
    klass: Klass;
    /** Its class skills: its `classSkill` links */
    klassSkills: ViewLink[];
    level: number;
    levels: {
      characterLevel: StoredAdvancement;
      feats: CustomizedFeat[];
      klassLevel: CustomizedClassLevel;
      skills: SkillWithRank[];
      spells: CustomizedSpell[];
    }[];
  };
}

/** A character's classes: each one's levels, with what each level picked, and the ruleset's other classes at level 0. */
export default class ClassesComponent extends CharacterComponent<LoadedCharacterData> {
  private readonly classes: ClassesData = {};

  /** Each class the character has levels in, its levels sorted with their picks, and the ruleset's others at level 0. */
  override initialize(
    {
      characterLevels,
      feats,
      klasses,
      klassLevels,
      klassSkills,
      spells,
      skills,
    }: Pick<
      LoadedCharacterData,
      "characterLevels" | "feats" | "klasses" | "klassLevels" | "klassSkills" | "spells" | "skills"
    >,
    { rulesetData }: RulesetView,
  ) {
    // Build per-level lookup indices once (replaces 4 .filter() scans per character level).
    const klassLevelsById = new Map<string, (typeof klassLevels)[number]>();
    for (const kl of klassLevels) klassLevelsById.set(kl.id, kl);
    const klassesById = new Map<string, Klass>();
    for (const k of klasses) klassesById.set(k.id, k);
    const klassSkillsByKlass = new Map<string, ViewLink[]>();
    for (const link of klassSkills) {
      const group = klassSkillsByKlass.get(link.fromId);
      if (group) group.push(link);
      else klassSkillsByKlass.set(link.fromId, [link]);
    }
    const featsByCharacterLevelId = new Map<string, typeof feats>();
    for (const f of feats) {
      const group = featsByCharacterLevelId.get(f.characterLevelId);
      if (group) group.push(f);
      else featsByCharacterLevelId.set(f.characterLevelId, [f]);
    }
    const skillsByCharacterLevelId = new Map<string, typeof skills>();
    for (const s of skills) {
      const group = skillsByCharacterLevelId.get(s.characterLevelId);
      if (group) group.push(s);
      else skillsByCharacterLevelId.set(s.characterLevelId, [s]);
    }
    const spellsByCharacterLevelId = new Map<string, typeof spells>();
    for (const p of spells) {
      const group = spellsByCharacterLevelId.get(p.characterLevelId);
      if (group) group.push(p);
      else spellsByCharacterLevelId.set(p.characterLevelId, [p]);
    }

    for (const characterLevel of characterLevels) {
      const klassLevel = klassLevelsById.get(characterLevel.trackId!);
      if (!klassLevel) throw new Error("Class level not found");

      const klass = klassesById.get(klassLevel.ownerId);
      if (!klass) throw new Error("Class not found");

      const klassName = stripSeparators(klass.name);
      if (!this.classes[klassName]) {
        this.classes[klassName] = {
          klass,
          klassSkills: klassSkillsByKlass.get(klass.id) ?? [],
          levels: [],
          level: 0,
          bonuscasterlevel: 0,
        };
      }

      this.classes[klassName].levels.push({
        klassLevel,
        characterLevel,
        feats: featsByCharacterLevelId.get(characterLevel.id) ?? [],
        skills: skillsByCharacterLevelId.get(characterLevel.id) ?? [],
        spells: spellsByCharacterLevelId.get(characterLevel.id) ?? [],
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
          klassSkills: [],
          levels: [],
          level: 0,
          bonuscasterlevel: 0,
        };
      }
    }
  }

  addProjectedLevel(klassName: string, klassLevel: KlassLevel, characterLevel: StoredAdvancement): void {
    const entry = this.classes[klassName];
    if (!entry) return;

    entry.levels.push({
      klassLevel: { ...klassLevel, modifiers: [], requirements: [] },
      characterLevel,
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
