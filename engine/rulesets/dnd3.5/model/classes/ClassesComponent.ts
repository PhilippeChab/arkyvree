import { CharacterComponent } from "@/engine/core/character/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type {
  LoadedCharacterData,
  SkillWithRank,
} from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import type {
  CustomizedClassLevel,
  CustomizedFeat,
  CustomizedPower,
} from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import type { CharacterLevel, Klass, KlassLevel, KlassSkill } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

interface ClassesData {
  [key: string]: {
    bonuscasterlevel: number;
    klass: Klass;
    klassSkills: KlassSkill[];
    level: number;
    levels: {
      characterLevel: CharacterLevel;
      feats: CustomizedFeat[];
      klassLevel: CustomizedClassLevel;
      powers: CustomizedPower[];
      skills: SkillWithRank[];
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
      powers,
      skills,
    }: Pick<
      LoadedCharacterData,
      "characterLevels" | "feats" | "klasses" | "klassLevels" | "klassSkills" | "powers" | "skills"
    >,
    { rulesetData }: RulesetView,
  ) {
    // Build per-level lookup indices once (replaces 4 .filter() scans per character level).
    const klassLevelsById = new Map<string, (typeof klassLevels)[number]>();
    for (const kl of klassLevels) klassLevelsById.set(kl.id, kl);
    const klassesById = new Map<string, Klass>();
    for (const k of klasses) klassesById.set(k.id, k);
    const klassSkillsByKlass = new Map<string, KlassSkill[]>();
    for (const ks of klassSkills) {
      const group = klassSkillsByKlass.get(ks.klassId);
      if (group) group.push(ks);
      else klassSkillsByKlass.set(ks.klassId, [ks]);
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
    const powersByCharacterLevelId = new Map<string, typeof powers>();
    for (const p of powers) {
      const group = powersByCharacterLevelId.get(p.characterLevelId);
      if (group) group.push(p);
      else powersByCharacterLevelId.set(p.characterLevelId, [p]);
    }

    for (const characterLevel of characterLevels) {
      const klassLevel = klassLevelsById.get(characterLevel.klassLevelId);
      if (!klassLevel) throw new Error("Klass level not found");

      const klass = klassesById.get(klassLevel.klassId);
      if (!klass) throw new Error("Klass not found");

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
        powers: powersByCharacterLevelId.get(characterLevel.id) ?? [],
      });
    }

    for (const klass of Object.values(this.classes)) {
      klass.levels.sort((a, b) => a.klassLevel.level - b.klassLevel.level);
      klass.level = klass.levels.length;
    }

    // Add level-0 entries for ruleset classes the character doesn't have
    for (const klass of rulesetData.klasses) {
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

  addProjectedLevel(klassName: string, klassLevel: KlassLevel, characterLevel: CharacterLevel): void {
    const entry = this.classes[klassName];
    if (!entry) return;

    entry.levels.push({
      klassLevel: { ...klassLevel, modifiers: [], properties: [], requirements: [] },
      characterLevel,
      feats: [],
      skills: [],
      powers: [],
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
