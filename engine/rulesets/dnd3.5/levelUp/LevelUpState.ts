import type { CharacterInput } from "@/engine/core/module/index.ts";
import RulesError from "@/engine/core/RulesError.ts";
import { type RulesetData, type RulesetView } from "@/engine/core/view/index.ts";
import CharacterBuilder from "@/engine/rulesets/dnd3.5/model/CharacterBuilder.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import type { ProjectedCharacterData } from "@/engine/rulesets/dnd3.5/model/projection.ts";
import SkillsComponent from "@/engine/rulesets/dnd3.5/model/skills/SkillsComponent.ts";
import type { Klass, KlassLevel, Modifier, Property, Requirement } from "@/shared/relations.ts";

/** The customizations of feats a projection carries, by feat id. */
export interface FeatCustomizations {
  modifiers: Map<string, Modifier[]>;
  properties: Map<string, Property[]>;
  requirements: Map<string, Requirement[]>;
}

/** A feat picked in a pool. */
export type FeatPick = { aptitudeId: string; featId: string };

/** A class level's granted feats, as the view joins them to their feats. */
export type GrantedFeatRecords =
  RulesetData["klassLevelFeatsWithFeatsByKlassLevel"] extends Map<string, infer R> ? R : never;

/** A level's picks: its skill ranks, and its feats and powers by the pool they're picked in. */
export interface LevelPicks {
  feats: Record<string, string[]>;
  powers: Record<string, string[]>;
  skills: Record<string, number>;
}

/** A planned level's class and class level, and its ability increase. */
export interface PlannedClassLevel {
  abilityId: string | null;
  klass: Klass;
  klassLevel: KlassLevel;
}

/**
 * What every level-up operation reads: the ruleset's view, the character it builds from the rows the server read, and
 * the classes and class levels the levels take.
 */
export default abstract class LevelUpState {
  constructor(protected readonly view: RulesetView) {}

  /** The character built from its rows, with a level-up's `projected` levels and picks. */
  protected build(character: CharacterInput, projected?: ProjectedCharacterData): DetailedCharacter {
    return CharacterBuilder.build(this.view, character, { projected });
  }

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

  /**
   * The class skills of planned levels, from their classes (`klassIds`, one per level): each level's, in the ruleset's
   * skill order (what a rank costs at that level), and every planned class's together (the rank cap).
   */
  protected getPlannedClassSkills(klassIds: string[]) {
    const { skills } = this.rulesetData;
    const recordsOf = (klassId: string) => this.rulesetData.klassSkillsWithSkillsByKlass.get(klassId) ?? [];
    const perLevel = klassIds.map((klassId) => {
      const ids = this.getClassSkillIds(recordsOf(klassId));
      return skills.filter((skill) => ids.has(skill.id)).map((skill) => skill.id);
    });
    const merged = this.getClassSkillIds([...new Set(klassIds)].flatMap(recordsOf));
    return { perLevel, merged };
  }

  /**
   * Each planned level's class and class level, from the composed ruleset: a cache hit is proof of lineage. Throws when a
   * class isn't the ruleset's (nor from `rulesetIds`, when given) or a player character's, or hasn't that level.
   */
  protected getPlannedKlassLevels(
    levels: { abilityId: string | null; klassId: string; level: number }[],
    rulesetIds?: Set<string>,
  ): PlannedClassLevel[] {
    return levels.map(({ klassId, level, abilityId }, i) => {
      const klass = this.rulesetData.klassesById.get(klassId);
      if (!klass || (rulesetIds && !rulesetIds.has(klass.rulesetId)))
        throw new RulesError("invalid", `Level ${i + 1}: Class does not belong to the character's ruleset`);

      if (klass.kind !== "pc")
        throw new RulesError("invalid", `Level ${i + 1}: Class is not valid for a player character`);

      const klassLevel = this.rulesetData.klassLevelByKlassAndLevel.get(`${klassId}:${level}`);
      if (!klassLevel) throw new RulesError("not-found", `Level ${i + 1}: Class level not found`);

      return { klass, klassLevel, abilityId };
    });
  }

  /** A saved character level's class level and class, in the composed ruleset, or a 404. */
  protected getSavedKlassLevel(characterLevel: { klassLevelId: string }) {
    const klassLevel = this.rulesetData.klassLevelsById.get(characterLevel.klassLevelId);
    if (!klassLevel) throw new RulesError("not-found", "Class level not found");

    const klass = this.rulesetData.klassesById.get(klassLevel.klassId);
    if (!klass) throw new RulesError("not-found", "Class not found");

    return { klassLevel, klass };
  }

  /** The modifiers, properties and requirements of these feats, so a projection carries their full effects. */
  protected loadFeatCustomizations(featIds: string[]): FeatCustomizations {
    const customizations: FeatCustomizations = { modifiers: new Map(), properties: new Map(), requirements: new Map() };
    for (const featId of featIds) {
      const modifiers = this.rulesetData.modifiersBySource.get(featId);
      if (modifiers) customizations.modifiers.set(featId, modifiers);
      const properties = this.rulesetData.propertiesByEntity.get(featId);
      if (properties) customizations.properties.set(featId, properties);
      const requirements = this.rulesetData.requirementsByEntity.get(featId);
      if (requirements) customizations.requirements.set(featId, requirements);
    }
    return customizations;
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
