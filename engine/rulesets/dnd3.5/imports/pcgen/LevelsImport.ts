import type { ImportedCharacter, ImportedFeat, ImportedLevel, ImportReport } from "@/engine/core/imports/index.ts";
import { LevelByLevel, type PlannedClassLevel } from "@/engine/core/levelUp/index.ts";
import type { AbilityIncrease, BondedPlan, CharacterInput, FeatPick, LevelWrites } from "@/engine/core/module/index.ts";
import RulesError, { type RulesIssue } from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import ImportedLevelGains from "@/engine/rulesets/dnd3.5/imports/ImportedLevelGains.ts";
import PicksPlacement, {
  type MatchedFeat,
  type MatchedSkill,
} from "@/engine/rulesets/dnd3.5/imports/PicksPlacement.ts";
import Dnd35LevelUp from "@/engine/rulesets/dnd3.5/levelUp/Dnd35LevelUp.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import type { Klass, KlassLevel } from "@/shared/relations.ts";

import { PCGEN_POOLS } from "./names.ts";
import type PcgenNames from "./PcgenNames.ts";

/** A level of the file, matched to the view's class level, its hit points within its hit die. */
interface MatchedLevel {
  hp: number;
  klass: Klass;
  klassLevel: KlassLevel;
  level: ImportedLevel;
}

/** Where an import's levels stop: after the levels it takes (`count`), at a level a level-up refuses, and why. */
export interface LevelStop {
  count: number;
  reason: string;
}

/**
 * A file's levels as the character takes them, one at a time, as if leveled up level by level (`LevelByLevel`): each
 * level its class's, its hit points, its ability increases, and the feats and skill ranks placed on it
 * (`PicksPlacement`), checked as a level-up checks it. The report says each level, what the checks found of it (saved
 * anyway), and the feats and ranks no level could take.
 */
export default class LevelsImport {
  constructor(
    private readonly view: RulesetView,
    private readonly imported: ImportedCharacter,
    private readonly names: PcgenNames,
    private readonly report: ImportReport,
    private readonly stop?: LevelStop,
  ) {
    this.levels = this.matchLevels();
  }

  /**
   * What an issue is about, its counts aside (an unspent point is still one at the next level): its category, the
   * entity it names, and its message with each number one.
   */
  private static issueKey({ category, entityName, entityType, message }: RulesIssue) {
    return [category, entityType ?? "", entityName ?? "", message.replace(/\d+/g, "#")].join("\u0000");
  }

  /** The file's levels the character takes, matched: up to the first the ruleset can't take. */
  private readonly levels: MatchedLevel[];

  private readonly levelUp = new Dnd35LevelUp();

  /** What the report says of a level: its class level, its hit points, its increases and its feats. */
  private describeLevel(index: number, level: MatchedLevel, increases: AbilityIncrease[], feats: FeatPick[]) {
    const { abilitiesById, featsById } = this.view.rulesetData;
    const parts = [`${level.klass.name} ${level.klassLevel.level}`, `${level.hp} hit points`];
    for (const { abilityId, amount } of increases) parts.push(`${abilitiesById.get(abilityId)?.name} +${amount}`);
    for (const { featId } of feats) parts.push(featsById.get(featId)?.name ?? featId);
    return `Level ${index + 1}: ${parts.join(", ")}`;
  }

  /** Each line of a feat of the file matched, with the pools it can be picked in; a domain is its domain's feat. */
  private matchFeats(): MatchedFeat[] {
    const { aptitudes, featsById } = this.view.rulesetData;
    const domains = this.imported.domains.map(({ line, name }): ImportedFeat => ({
      line,
      name: `${name} Domain`,
      pool: "Domain",
    }));
    return [...this.imported.feats, ...domains].flatMap((feat) => {
      const shown = feat.choice ? `${feat.name} (${feat.choice})` : feat.name;
      const found = this.names.findFeat(feat.name, feat.choice);
      if (!found) {
        this.report.skip(feat.line, `${shown} isn't a feat of the ruleset`);
        return [];
      }
      const poolIds = (featsById.get(found.id)?.featsAptitudesInRules ?? []).map((link) => link.aptitudeId);
      const hinted = aptitudes.find((aptitude) => aptitude.name === PCGEN_POOLS.get(feat.pool))?.id;
      return [
        {
          featId: found.id,
          line: feat.line,
          name: found.name,
          poolIds,
          hintedPoolId: hinted && poolIds.includes(hinted) ? hinted : undefined,
        },
      ];
    });
  }

  /**
   * The file's levels matched to the view's class levels, in the order taken, up to the first the ruleset can't take
   * (a class it hasn't, a class level past its last, a level past a character's last): that one and those after it
   * are listed. A level's hit points outside its hit die's are brought within it, which the report says.
   */
  private matchLevels(): MatchedLevel[] {
    const matched: MatchedLevel[] = [];
    const levelsLeft = LevelRules.countLevelsLeft(0);
    for (const level of this.imported.levels) {
      const klass = this.names.findClass(level.className);
      const klassLevel =
        klass && this.view.rulesetData.klassLevelByKlassAndLevel.get(`${klass.id}:${level.classLevel}`);
      // A class's levels come one after another: its next is one past those taken
      const taken = matched.filter((other) => other.klass.id === klass?.id).length;
      if (this.stop && matched.length === this.stop.count) {
        this.skipFrom(level, this.stop.reason);
        break;
      }
      if (!klass || !klassLevel || level.classLevel !== taken + 1 || matched.length >= levelsLeft) {
        const reason = !klass
          ? `${level.className} isn't a class of the ruleset`
          : `${level.className} ${level.classLevel} can't be taken there`;
        this.skipFrom(level, reason);
        break;
      }
      const { max, min } = this.levelUp.hitPointsOf(klass.hd);
      const hp = Math.min(max, Math.max(min, Math.round(level.hp)));
      if (hp !== level.hp)
        this.report.issue(`Level ${matched.length + 1}: ${level.hp} hit points outside a d${klass.hd}: ${hp} kept`);
      matched.push({ hp, klass, klassLevel, level });
    }
    return matched;
  }

  /** Each line of a skill of the file matched, a rank bought in a class each: a skill the ruleset hasn't is listed. */
  private matchSkills(): MatchedSkill[] {
    return this.imported.skills.flatMap((skill) => {
      const found = this.names.findSkill(skill.name);
      if (!found) {
        this.report.skip(skill.line, `${skill.name} isn't a skill of the ruleset`);
        return [];
      }
      return skill.bought.map(({ className, ranks }) => ({
        className,
        line: skill.line,
        name: found.name,
        ranks,
        skillId: found.id,
      }));
    });
  }

  /**
   * The next level's plan (`request`, with its `picks`), saved forced: or why a level-up refuses it even forced
   * (`refusal`), which the levels stop at.
   */
  private planLevel(
    leveling: LevelByLevel<DetailedCharacter>,
    request: Parameters<LevelByLevel<DetailedCharacter>["planLevel"]>[0],
    picks: Parameters<LevelByLevel<DetailedCharacter>["planLevel"]>[1],
  ) {
    try {
      return leveling.planLevel(request, picks);
    } catch (error) {
      if (error instanceof RulesError) return { refusal: error.message };
      throw error;
    }
  }

  /**
   * Lists what no level took: a feat another line of the file picked already isn't imported again, one its class or
   * race gives anyway is imported, the others aren't.
   */
  private reportLeft(placement: PicksPlacement, character: DetailedCharacter, writes: LevelWrites[]) {
    const picked = new Set(writes.flatMap(({ rows }) => rows.feats.map(({ featId }) => featId)));
    const held = new Set(character.getHeldFeats().map((feat) => feat.id));
    for (const feat of placement.leftFeats()) {
      // Two lines the ruleset reads as one feat (a choice it keeps whole): the second isn't another pick
      // A stackable feat's copy no level took is lost as any feat, however many copies the levels took
      const stackable = this.view.rulesetData.featsById.get(feat.featId)?.stackable === true;
      if (picked.has(feat.featId) && !stackable)
        this.report.skip(feat.line, `${feat.name} is imported already, from another line`);
      else if (held.has(feat.featId) && !picked.has(feat.featId))
        this.report.import(`Feat: ${feat.name}, given by its class or race`);
      else this.report.skip(feat.line, `${feat.name}: no level could take it (its requirements, or no room left)`);
    }
    for (const skill of placement.leftSkills()) {
      this.report.skip(
        skill.line,
        `${skill.name}: ${skill.ranks} rank(s) bought as ${skill.className} no level could take`,
      );
    }
  }

  /** Lists a level the character can't take (`level`, and why) and every level after it, which wait on it. */
  private skipFrom(level: ImportedLevel, reason: string) {
    for (const later of this.imported.levels.slice(this.imported.levels.indexOf(level)))
      this.report.skip(later.line, later === level ? reason : "A level before it couldn't be imported");
  }

  /** How many of the file's levels the character takes: those before the first the ruleset can't take. */
  get levelCount(): number {
    return this.levels.length;
  }

  /**
   * The levels the character (`character`, its rows without levels) takes, as if leveled up one at a time, each with
   * its ability increases (`increases`, by level): what each writes, and the character's rows with them all; or where
   * they stop (`refused`), at a level a level-up refuses even forced, which the import is planned again without.
   */
  planLevels(
    character: CharacterInput,
    increases: AbilityIncrease[][],
  ): { refused: LevelStop } | { bonded: BondedPlan[]; character: CharacterInput; levels: LevelWrites[] } {
    const { levels } = this;
    const placement = new PicksPlacement(this.view.rulesetData, this.matchFeats(), this.matchSkills());
    const leveling = new LevelByLevel<DetailedCharacter>(this.view, character, this.levelUp);
    const lastOfClass = new Map(levels.map((level, index) => [level.level.className, index + 1]));
    const writes: LevelWrites[] = [];
    let issuesBefore = new Set<string>();
    for (const [index, level] of levels.entries()) {
      const abilityIncreases = increases[index] ?? [];
      const entry: PlannedClassLevel = { abilityIncreases, klass: level.klass, klassLevel: level.klassLevel };
      const levelGains = new ImportedLevelGains(this.view, leveling.character, this.levelUp);
      const gains = levelGains.describeGains(entry);
      const featPicks = placement.placeFeats(levelGains, entry, gains.featRoom);
      const skills = placement.placeSkills({
        characterLevel: index + 1,
        className: level.level.className,
        gains,
        lastClassLevel: lastOfClass.get(level.level.className) ?? index + 1,
      });
      const feats: Record<string, string[]> = {};
      for (const { aptitudeId, featId } of featPicks) (feats[aptitudeId] ??= []).push(featId);
      const request = { abilityIncreases, hp: level.hp, klassId: level.klass.id, level: level.klassLevel.level };
      const planned = this.planLevel(leveling, request, { feats, powers: {}, skills });
      // Refused even forced: the import is planned again without it, its increases out of the starting scores
      if ("refusal" in planned)
        return { refused: { count: index, reason: `A level-up refuses it: ${planned.refusal}` } };
      writes.push(planned.writes);
      this.report.import(this.describeLevel(index, level, abilityIncreases, featPicks));
      // An issue the level before had already (its counts aside: an unspent point is still one) was said there
      const issues = new Map(planned.issues.map((issue) => [LevelsImport.issueKey(issue), issue.message]));
      for (const [key, message] of issues)
        if (!issuesBefore.has(key)) this.report.issue(`Level ${index + 1}: ${message}`);
      issuesBefore = new Set(issues.keys());
    }
    this.reportLeft(placement, leveling.buildCharacter(), writes);
    return { bonded: leveling.planBonded().bonded, character: leveling.character, levels: writes };
  }
}
