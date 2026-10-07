import {
  type CharacterLevel,
  type Feat,
  type Klass,
  type KlassLevel,
  type KlassSkill,
  type Modifier,
  type Power,
  type Property,
  type Requirement,
  type Skill,
} from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

type ClassesData = {
  [key: string]: {
    klass: Klass;
    klassSkills: KlassSkill[];
    level: number;
    bonuscasterlevel: number;
    levels: {
      klassLevel: KlassLevel & {
        modifiers: Modifier[];
        properties: Property[];
        requirements: Requirement[];
      };
      characterLevel: CharacterLevel;
      feats: (Feat & {
        klassLevelId: string;
        characterLevelId: string;
        aptitudeId: string;
        modifiers: Modifier[];
        properties: Property[];
        requirements: Requirement[];
      })[];
      skills: (Skill & {
        klassLevelId: string;
        characterLevelId: string;
        rank: number;
      })[];
      powers: (Power & {
        klassLevelId: string;
        characterLevelId: string;
        aptitudeId: string;
        free?: boolean;
        saveName: string | null;
        powerLevel: number | null;
        properties: Property[];
      })[];
    }[];
  };
};

export default class ClassesComponent {
  private readonly classes: ClassesData = {};

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

  getCharacterClasses() {
    return Object.fromEntries(Object.entries(this.classes).filter(([, klass]) => klass.level > 0));
  }

  getClasses() {
    return this.classes;
  }

  initialize(
    klasses: Klass[],
    klassSkills: KlassSkill[],
    klassLevels: (KlassLevel & {
      modifiers: Modifier[];
      properties: Property[];
      requirements: Requirement[];
    })[],
    characterLevels: CharacterLevel[],
    feats: (Feat & {
      klassLevelId: string;
      characterLevelId: string;
      aptitudeId: string;
      modifiers: Modifier[];
      properties: Property[];
      requirements: Requirement[];
    })[],
    skills: (Skill & {
      klassLevelId: string;
      characterLevelId: string;
      rank: number;
    })[],
    powers: (Power & {
      klassLevelId: string;
      characterLevelId: string;
      aptitudeId: string;
      free?: boolean;
      saveName: string | null;
      powerLevel: number | null;
      properties: Property[];
    })[],
    rulesetKlasses?: Klass[],
  ) {
    // Build per-level lookup indices once (replaces 4 .filter() scans per character level).
    const klassLevelsById = new Map<string, (typeof klassLevels)[number]>();
    for (const kl of klassLevels) klassLevelsById.set(kl.id, kl);
    const klassesById = new Map<string, Klass>();
    for (const k of klasses) klassesById.set(k.id, k);
    const klassSkillsByKlassId = new Map<string, KlassSkill[]>();
    for (const ks of klassSkills) {
      const group = klassSkillsByKlassId.get(ks.klassId);
      if (group) group.push(ks);
      else klassSkillsByKlassId.set(ks.klassId, [ks]);
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
      if (!klassLevel) {
        throw new Error("Klass level not found");
      }

      const klass = klassesById.get(klassLevel.klassId);
      if (!klass) {
        throw new Error("Klass not found");
      }

      const klassName = stripSeparators(klass.name);
      if (!this.classes[klassName]) {
        this.classes[klassName] = {
          klass,
          klassSkills: klassSkillsByKlassId.get(klass.id) ?? [],
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
    if (rulesetKlasses) {
      for (const klass of rulesetKlasses) {
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
  }

  removeProjectedLevel(klassName: string): void {
    const entry = this.classes[klassName];
    if (!entry || entry.levels.length === 0) return;

    entry.levels.pop();
    entry.level--;
  }
}
