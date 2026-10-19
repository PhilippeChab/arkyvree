import type { SourceLine } from "@/engine/core/imports/index.ts";
import type { PlannedClassLevel } from "@/engine/core/levelUp/index.ts";
import type { FeatPick, PowerPick } from "@/engine/core/module/index.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import SkillRules from "@/engine/rulesets/dnd3.5/rules/SkillRules.ts";

import type ImportedLevelGains from "./ImportedLevelGains.ts";
import type { LevelGains } from "./ImportedLevelGains.ts";

/** A level, as its skills are placed: its gains, its class, the character's level with it, and its class's last. */
interface SkillLevel {
  /** The character's level with it, from 1 */
  characterLevel: number;
  className: string;
  gains: LevelGains;
  /** The character's level the file's last level of its class is: the ranks bought in it can wait till then */
  lastClassLevel: number;
}

/**
 * A feat the file holds, matched to the view's: the pools it can be picked in, the one the file picked it in first
 * when it's one of them (`hintedPoolId`), and its line.
 */
export interface MatchedFeat {
  featId: string;
  hintedPoolId?: string;
  line: SourceLine;
  name: string;
  poolIds: string[];
}

/**
 * A spell the character chose to know, matched to the view's: the spell list of its class it's on (`aptitudeId`), its
 * level there, and its line.
 */
export interface MatchedPower {
  aptitudeId: string;
  level: number;
  line: SourceLine;
  name: string;
  powerId: string;
}

/** A skill's ranks the file holds, matched to the view's: those bought in a class (`className`), and its line. */
export interface MatchedSkill {
  className: string;
  line: SourceLine;
  name: string;
  ranks: number;
  skillId: string;
}

/**
 * The feats, skill ranks and spells a file holds placed on the levels the character takes, one level at a time, as a
 * player leveling up would have picked them (PCGen lists them, not the level each was taken at): a feat on the first
 * level with room in a pool it can be picked in whose requirements the character meets there, its file's pool first;
 * a skill's ranks over the levels of the class they were bought in, within each level's points and maximum ranks, what
 * can't wait for a later level first; a spell on the first level its class's spell list has room for it at its spell
 * level. What no level takes is left (`leftFeats`, `leftSkills`, `leftPowers`), for the report.
 */
export default class PicksPlacement {
  constructor(
    private readonly rulesetData: RulesetData,
    feats: MatchedFeat[],
    skills: MatchedSkill[],
    powers: MatchedPower[],
  ) {
    this.feats = [...feats];
    this.skills = skills.map((skill) => ({ ...skill }));
    this.powers = [...powers];
  }

  /** The feats not placed yet, in the file's order. */
  private readonly feats: MatchedFeat[];

  /** The spells not placed yet, in the file's order. */
  private readonly powers: MatchedPower[];

  /** The skills' ranks not placed yet, by the class they were bought in. */
  private readonly skills: MatchedSkill[];

  /** Whether the character (`character`) can take the feat: it meets its requirements, and holds it not unless it stacks. */
  private canTake(character: DetailedCharacter, feat: MatchedFeat) {
    const stackable = this.rulesetData.featsById.get(feat.featId)?.stackable === true;
    if (!stackable && character.getHeldFeats().some((held) => held.id === feat.featId)) return false;
    const requirements = this.rulesetData.requirementsByEntity.get(feat.featId) ?? [];
    return requirements.length === 0 || character.areRequirementsMet([requirements]);
  }

  /**
   * The next feat a level takes, and the pool it takes it in: one the character can take, in its file's pool when that
   * has room (`hinted`), or in any pool of its with room otherwise.
   */
  private findNext(character: DetailedCharacter, room: Map<string, number>, hinted: boolean) {
    for (const feat of this.feats) {
      const pools = hinted ? [feat.hintedPoolId] : feat.poolIds;
      const poolId = pools.find((id) => id !== undefined && (room.get(id) ?? 0) > 0);
      if (poolId && this.canTake(character, feat)) return { feat, poolId };
    }
    return undefined;
  }

  /** Whether a level's spell lists have room (`room`, by list, then spell level) for a spell not placed yet. */
  hasRoomFor(room: Map<string, Map<number, number>>) {
    return this.powers.some((power) => (room.get(power.aptitudeId)?.get(power.level) ?? 0) > 0);
  }

  /** The feats no level took, in the file's order. */
  leftFeats(): MatchedFeat[] {
    return this.feats;
  }

  /** The spells no level took, in the file's order. */
  leftPowers(): MatchedPower[] {
    return this.powers;
  }

  /** The skills whose ranks no level took all of: the ranks each has left. */
  leftSkills(): MatchedSkill[] {
    return this.skills.filter((skill) => skill.ranks > 0);
  }

  /**
   * The feats a level (`entry`, whose gains `levelGains` reads, with the skill points it spends, `skills`) takes, each
   * in a pool: one at a time, while a pool has room, the first feat (in the file's order) the character with the
   * level, its ranks and the feats placed on it so far can take, in its file's pool first, then in any pool of its.
   */
  placeFeats(
    levelGains: ImportedLevelGains,
    entry: PlannedClassLevel,
    { room, skills }: { room: Map<string, number>; skills: Record<string, number> },
  ): FeatPick[] {
    const placed: FeatPick[] = [];
    const left = new Map(room);
    let character = levelGains.buildWith(entry, skills, placed);
    for (;;) {
      const next = this.findNext(character, left, true) ?? this.findNext(character, left, false);
      if (!next) return placed;
      placed.push({ aptitudeId: next.poolId, featId: next.feat.featId });
      left.set(next.poolId, (left.get(next.poolId) ?? 0) - 1);
      this.feats.splice(this.feats.indexOf(next.feat), 1);
      character = levelGains.buildWith(entry, skills, placed);
    }
  }

  /**
   * The spells a level learns, each in its class's spell list: in the file's order, each its list has room for at its
   * spell level (`room`, by list, then spell level), and the character doesn't know there already (`held`: a spell its
   * class or race makes known, or one a level before it learned).
   */
  placePowers({ held, room }: { held: { aptitudeId: string; id: string }[]; room: Map<string, Map<number, number>> }) {
    const placed: PowerPick[] = [];
    const known = new Set(held.map(({ aptitudeId, id }) => `${aptitudeId}:${id}`));
    const left = new Map([...room].map(([aptitudeId, byLevel]) => [aptitudeId, new Map(byLevel)]));
    for (const power of [...this.powers]) {
      const key = `${power.aptitudeId}:${power.powerId}`;
      const atLevel = left.get(power.aptitudeId);
      if (known.has(key) || !atLevel || (atLevel.get(power.level) ?? 0) <= 0) continue;
      placed.push({ aptitudeId: power.aptitudeId, powerId: power.powerId });
      atLevel.set(power.level, atLevel.get(power.level)! - 1);
      known.add(key);
      this.powers.splice(this.powers.indexOf(power), 1);
    }
    return placed;
  }

  /**
   * The skill points a level spends, by skill: on the ranks bought in its class, within its points and each skill's
   * maximum ranks at it (a rank costs two points where it isn't a class skill of the level's class). The ranks that
   * can't wait (more than the class's later levels can still raise the skill by) go first, then the most left.
   */
  placeSkills({ characterLevel, className, gains, lastClassLevel }: SkillLevel): Record<string, number> {
    const spent: Record<string, number> = {};
    let points = gains.skillPoints;
    const ofClass = this.skills.filter((skill) => skill.className === className && skill.ranks > 0);
    // The ranks each skill can still take at the level: the file's lines that name one skill (two crafts of the
    // ruleset's one Craft) share it
    const headroom = new Map<string, number>();
    const states = ofClass.map((skill) => {
      const context = gains.skills.get(skill.skillId) ?? { currentRank: 0, isClassSkill: false };
      const max = SkillRules.maxRank(characterLevel, context.isClassSkill);
      const later = SkillRules.maxRank(lastClassLevel, context.isClassSkill) - max;
      const pointsPerRank = SkillRules.pointsFor(1, gains.classSkillIds.has(skill.skillId));
      headroom.set(skill.skillId, max - context.currentRank);
      return { later, pointsPerRank, skill };
    });
    const spend = (state: (typeof states)[number], ranks: number) => {
      const { skillId } = state.skill;
      // Whole points only: a class skill's rank a point, a cross-class half rank a point
      const wanted = Math.max(0, Math.min(ranks, headroom.get(skillId)!, state.skill.ranks));
      const cost = Math.min(points, Math.floor(wanted * state.pointsPerRank));
      const bought = cost / state.pointsPerRank;
      if (cost <= 0) return;
      spent[skillId] = (spent[skillId] ?? 0) + cost;
      points -= cost;
      headroom.set(skillId, headroom.get(skillId)! - bought);
      state.skill.ranks -= bought;
    };
    const urgent = states.toSorted((a, b) => b.skill.ranks - b.later - (a.skill.ranks - a.later));
    for (const state of urgent) spend(state, state.skill.ranks - state.later);
    for (const state of states.toSorted((a, b) => b.skill.ranks - a.skill.ranks)) spend(state, state.skill.ranks);
    return spent;
  }
}
