/** Whether a class's levels would grant a feat that doesn't stack at more than one of them. */

import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Pf1View from "@/engine/rulesets/pf1/view/Pf1View.ts";
import type { Klass, KlassLevel } from "@/engine/rulesets/pf1/view/rows.ts";

import FeatRules from "./FeatRules.ts";

/**
 * The notes on a feat that isn't Stackable, which the class's card shows, in its rules' words: the levels that grant it
 * (`from`), which a click on another moves it from (`moveText`), and those past its first, which give nothing there
 * (`idle`, `idleText`), the feat as its first level names it (`toId`).
 */
interface FeatureNote {
  from: string[];
  idle: string[];
  idleText: string;
  moveText: string;
  toId: string;
}

/** A level's feats it grants, before a save and once written, by the ids the view knows them by, and its number. */
interface LevelGrants {
  after: readonly string[];
  before: readonly string[];
  position: number;
}

/**
 * The feats a class's levels grant (`klass`, as the view has it), and whether a save of some of them gives a feat a
 * character takes once (a feat that isn't Stackable, `FEAT_STACKABLE`) at more than one: the character holds it once,
 * so the levels after the first would give nothing.
 */
export default class FeatureStacking {
  constructor(
    private readonly view: RulesetView,
    private readonly klass: Klass,
  ) {}

  /** Levels' numbers as a sentence names them: "level 5", "levels 1 and 5", "levels 1, 5 and 9". */
  static formatLevels(positions: readonly number[]) {
    if (positions.length === 1) return `level ${positions[0]}`;
    return `levels ${positions.slice(0, -1).join(", ")} and ${positions.at(-1)}`;
  }

  /** Feats' ids as the view knows them (`canonicalize`: a source's id sent for its fork's copy, the copy's). */
  private canonical(featIds: readonly string[]) {
    return featIds.map((id) => this.view.rulesetData.canonicalize(id));
  }

  /** The class's levels' feats, as the view has them and once written (`changed`, by level id: the others kept). */
  private levelsOf(changed: ReadonlyMap<string, readonly string[]>): LevelGrants[] {
    return (this.pf1.classLevelsByClass.get(this.klass.id) ?? []).map((level) => {
      const before = this.canonical(this.pf1.grantedFeatsOf(level.id).map(({ toId }) => toId));
      const after = changed.get(level.id);
      return { after: after ? this.canonical(after) : before, before, position: level.position };
    });
  }

  /** The view's Pathfinder lists and indices. */
  private get pf1(): Pf1View {
    return Pf1View.of(this.view.rulesetData);
  }

  /**
   * Refuses levels' grants once written (`changed`: a changed level's feats by its id, the others as the view has them;
   * `added`: new levels', by their numbers) that grant a feat that isn't Stackable at a level past another the class
   * grants it at ("Aura (Cleric) isn't Stackable: Cleric can grant it at one level, not at levels 1 and 5"). A repeat
   * the class has already stands while the save grants it at no new level, so a class saved before the rule still saves.
   */
  check(
    changed: ReadonlyMap<string, readonly string[]>,
    added: readonly { feats: readonly string[]; position: number }[] = [],
  ) {
    const levels = [
      ...this.levelsOf(changed),
      ...added.map(({ feats, position }) => ({ after: this.canonical(feats), before: [], position })),
    ];
    const rules = FeatRules.of(this.view.rulesetData);
    for (const featId of new Set(levels.flatMap(({ after }) => after))) {
      const feat = this.pf1.featsById.get(featId);
      if (!feat || rules.isStackable(featId)) continue;
      const at = levels.filter(({ after }) => after.includes(featId));
      if (at.length < 2 || at.every(({ before }) => before.includes(featId))) continue;
      const where = FeatureStacking.formatLevels(at.map(({ position }) => position).toSorted((a, b) => a - b));
      const message = `${feat.name} isn't Stackable: ${this.klass.name} can grant it at one level, not at ${where}`;
      throw new RulesError("conflict", message);
    }
  }

  /**
   * The notes on what the class's levels grant once written (`changed`: a changed level's feats by its id, as its save
   * sends them, the others as the view has them), one for each feat that isn't Stackable, in its rules' words (`words`:
   * the feat at `{name}`, levels at `{position}`): the levels that grant it, which a click on another moves it from
   * (`single`), and those past its first, which give nothing there (`repeat`).
   */
  describeNotes(changed: ReadonlyMap<string, readonly string[]>, words: { repeat: string; single: string }) {
    const rules = FeatRules.of(this.view.rulesetData);
    const levels = (this.pf1.classLevelsByClass.get(this.klass.id) ?? []).toSorted((a, b) => a.position - b.position);
    // Each feat that isn't Stackable, by the id the view knows it by: the levels granting it, and its name and id there
    const feats = new Map<string, { at: KlassLevel[]; name: string; toId: string }>();
    for (const level of levels) {
      for (const toId of changed.get(level.id) ?? this.pf1.grantedFeatsOf(level.id).map((grant) => grant.toId)) {
        const featId = this.view.rulesetData.canonicalize(toId);
        const feat = this.pf1.featsById.get(featId);
        if (!feat || rules.isStackable(featId)) continue;
        const held = feats.get(featId) ?? { at: [], name: feat.name, toId };
        if (!held.at.includes(level)) held.at.push(level);
        feats.set(featId, held);
      }
    }
    return [...feats.values()].map(({ at, name, toId }): FeatureNote => {
      const fill = (template: string, position: string) =>
        template.replace("{name}", () => name).replace("{position}", () => position);
      return {
        from: at.map((level) => level.id),
        idle: at.slice(1).map((level) => level.id),
        idleText: fill(words.repeat, `level ${at[0].position}`),
        moveText: fill(words.single, FeatureStacking.formatLevels(at.map((level) => level.position))),
        toId,
      };
    });
  }
}
