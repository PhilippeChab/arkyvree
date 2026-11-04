/** Whether a class's levels would grant a feat that doesn't stack at more than one of them. */

import RulesError from "@/engine/core/RulesError.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Klass } from "@/engine/rulesets/dnd3.5/view/rows.ts";

import FeatRules from "./FeatRules.ts";

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

  /** The view's 3.5 lists and indices. */
  private get dnd35(): Dnd35View {
    return Dnd35View.of(this.view.rulesetData);
  }

  /** The class's levels' feats, as the view has them and once written (`changed`, by level id: the others kept). */
  private levelsOf(changed: ReadonlyMap<string, readonly string[]>): LevelGrants[] {
    return (this.dnd35.classLevelsByClass.get(this.klass.id) ?? []).map((level) => {
      const before = this.canonical(this.dnd35.grantedFeatsOf(level.id).map(({ toId }) => toId));
      const after = changed.get(level.id);
      return { after: after ? this.canonical(after) : before, before, position: level.position };
    });
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
      const feat = this.dnd35.featsById.get(featId);
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
   * sends them, the others as the view has them): a feat that isn't Stackable gives nothing at each level past the first
   * that grants it, which its note says in its rules' words (`repeat`: the feat at `{name}`, its first level at
   * `{position}`), by the level's id (`ownedId`) and the feat's as the level names it (`toId`).
   */
  describeNotes(changed: ReadonlyMap<string, readonly string[]>, repeat: string) {
    const rules = FeatRules.of(this.view.rulesetData);
    const levels = (this.dnd35.classLevelsByClass.get(this.klass.id) ?? []).toSorted((a, b) => a.position - b.position);
    // Each feat's first level, by the id the view knows it by: a level granting it twice, through two pools, repeats
    // nothing
    const first = new Map<string, number>();
    return levels.flatMap((level) => {
      const granted = changed.get(level.id) ?? this.dnd35.grantedFeatsOf(level.id).map(({ toId }) => toId);
      return [...new Set(granted)].flatMap((toId) => {
        const featId = this.view.rulesetData.canonicalize(toId);
        const feat = this.dnd35.featsById.get(featId);
        if (!feat || rules.isStackable(featId)) return [];
        const at = first.get(featId) ?? level.position;
        first.set(featId, at);
        if (at === level.position) return [];
        const text = repeat.replace("{name}", () => feat.name).replace("{position}", () => `level ${at}`);
        return [{ ownedId: level.id, text, toId }];
      });
    });
  }
}
