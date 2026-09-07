import type { TargetPath } from "@/shared/customization/target.ts";
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
import { stripSeparators } from "@/shared/utils.ts";

export type DetailedCharacterComprehensiveClasses = {
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

export default class DetailedCharacterClasses {
  static getSegmentLabels(): Record<string, string> {
    return { level: "Level", bonuscasterlevel: "Bonus Caster Level" };
  }

  static generateTargetPaths(
    klasses: Klass[],
    kind: "modifier" | "requirement",
  ): TargetPath[] {
    const paths: TargetPath[] = [];

    for (const klass of klasses) {
      const normalizedClassName = stripSeparators(klass.name);

      paths.push({
        path: `classes.${normalizedClassName}.level`,
        category: "classes",
        description: `Number of ${klass.name} levels taken`,
        valueType: "number",
        operators: kind === "modifier" ? ["add", "subtract", "set"] : [
          "equal",
          "not_equal",
          "greater_than",
          "less_than",
          "greater_than_or_equal",
          "less_than_or_equal",
        ],
      });

      if (kind === "modifier") {
        paths.push({
          path: `classes.${normalizedClassName}.bonuscasterlevel`,
          category: "classes",
          description: `${klass.name} bonus caster levels from prestige classes`,
          valueType: "number",
          operators: ["add", "subtract", "set"],
        });
      }
    }

    return paths;
  }

  private readonly detailedCharacterClasses: DetailedCharacterComprehensiveClasses = {};

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
      if (!this.detailedCharacterClasses[klassName]) {
        this.detailedCharacterClasses[klassName] = {
          klass,
          klassSkills: klassSkillsByKlassId.get(klass.id) ?? [],
          levels: [],
          level: 0,
          bonuscasterlevel: 0,
        };
      }

      this.detailedCharacterClasses[klassName].levels.push({
        klassLevel,
        characterLevel,
        feats: featsByCharacterLevelId.get(characterLevel.id) ?? [],
        skills: skillsByCharacterLevelId.get(characterLevel.id) ?? [],
        powers: powersByCharacterLevelId.get(characterLevel.id) ?? [],
      });
    }

    for (const klass of Object.values(this.detailedCharacterClasses)) {
      klass.levels.sort((a, b) => a.klassLevel.level - b.klassLevel.level);
      klass.level = klass.levels.length;
    }

    // Add level-0 entries for ruleset classes the character doesn't have
    if (rulesetKlasses) {
      for (const klass of rulesetKlasses) {
        const klassName = stripSeparators(klass.name);
        if (!this.detailedCharacterClasses[klassName]) {
          this.detailedCharacterClasses[klassName] = {
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

  getClasses() {
    return this.detailedCharacterClasses;
  }

  getCharacterClasses() {
    return Object.fromEntries(
      Object.entries(this.detailedCharacterClasses).filter(([, klass]) => klass.level > 0),
    );
  }

  getClass(klassName: string) {
    return this.detailedCharacterClasses[klassName];
  }

  addProjectedLevel(
    klassName: string,
    klassLevel: KlassLevel,
    characterLevel: CharacterLevel,
  ): void {
    const entry = this.detailedCharacterClasses[klassName];
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

  removeProjectedLevel(klassName: string): void {
    const entry = this.detailedCharacterClasses[klassName];
    if (!entry || entry.levels.length === 0) return;

    entry.levels.pop();
    entry.level--;
  }
}
