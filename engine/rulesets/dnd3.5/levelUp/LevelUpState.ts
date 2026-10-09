import RulesError from "@/engine/core/RulesError.ts";
import { type RulesetData, type RulesetView } from "@/engine/core/view/index.ts";
import SkillsComponent from "@/engine/rulesets/dnd3.5/model/skills/SkillsComponent.ts";

/** A level's picks: its skill ranks, and its feats and powers by the pool they're picked in. */
export interface LevelPicks {
  feats: Record<string, string[]>;
  powers: Record<string, string[]>;
  skills: Record<string, number>;
}

/**
 * What every level-up operation reads: the ruleset's view, and the classes, class levels and class skills the levels
 * take.
 */
export default abstract class LevelUpState {
  constructor(protected readonly view: RulesetView) {}

  /**
   * The spell level of each of these powers in each pool it's linked to, by `powerId:aptitudeId`: a spell can be at
   * different levels in different pools (Wizard 1, Bard 0).
   */
  protected buildPowerLevelLookup(powerIds: string[]) {
    const lookup = new Map<string, number | null>();
    for (const powerId of powerIds) {
      const power = this.rulesetData.powersById.get(powerId);
      if (!power) continue;
      for (const pa of power.powersAptitudesInRules) lookup.set(`${pa.powerId}:${pa.aptitudeId}`, pa.level);
    }
    return lookup;
  }

  /** The skills class skill records make class skills: theirs, and the ruleset's subtypes of them ("Craft (…)" of Craft). */
  protected getClassSkillIds(records: { skillId: string; skillsInRule: { name: string } }[]): Set<string> {
    const ids = new Set(records.map((record) => record.skillId));
    const names = new Set(records.map((record) => record.skillsInRule.name));
    for (const skill of this.rulesetData.skills) if (SkillsComponent.isSubtypeOf(skill.name, names)) ids.add(skill.id);

    return ids;
  }

  /** The class's level `level`, in the composed ruleset, or a 404. */
  protected getKlassLevel(klassId: string, level: number) {
    const klassLevel = this.rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
    if (!klassLevel) throw new RulesError("not-found", "Class level not found");
    return klassLevel;
  }

  /** A saved character level's class level and class, in the composed ruleset, or a 404. */
  protected getSavedKlassLevel(characterLevel: { klassLevelId: string }) {
    const klassLevel = this.rulesetData.klassLevelsById.get(characterLevel.klassLevelId);
    if (!klassLevel) throw new RulesError("not-found", "Class level not found");

    const klass = this.rulesetData.klassesById.get(klassLevel.klassId);
    if (!klass) throw new RulesError("not-found", "Class not found");

    return { klassLevel, klass };
  }

  protected get rulesetData(): RulesetData {
    return this.view.rulesetData;
  }

  /** A level's picks as the rows a save writes: its skill ranks but those at none, and its feats and powers by pool. */
  protected toPickRows({ feats, powers, skills }: LevelPicks) {
    return {
      feats: Object.entries(feats).flatMap(([aptitudeId, ids]) => ids.map((featId) => ({ featId, aptitudeId }))),
      powers: Object.entries(powers).flatMap(([aptitudeId, ids]) => ids.map((powerId) => ({ powerId, aptitudeId }))),
      skills: Object.entries(skills)
        .filter(([, rank]) => rank > 0)
        .map(([skillId, rank]) => ({ skillId, rank })),
    };
  }
}
