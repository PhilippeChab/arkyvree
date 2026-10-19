import type { ImportedCharacter, ImportReport } from "@/engine/core/imports/index.ts";
import type { AbilityIncrease } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import NewCharacters from "@/engine/rulesets/dnd3.5/characters/NewCharacters.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import { formatSigned } from "@/shared/text.ts";
import { ABILITY_NAMES } from "@/vocabulary/dnd3.5/abilities.ts";

import { PCGEN_ABILITIES } from "./names.ts";

/** A character's scores as an import writes them: its starting scores by ability id, and each level's increases. */
export interface ImportedScores {
  increases: AbilityIncrease[][];
  starting: Record<string, number>;
}

/**
 * A file's ability scores as the app keeps them: its starting scores and each level's increases, which add up to the
 * file's scores. A level takes the increases its ruleset's Settings give it (`LevelRules`), the ones the file recorded
 * at it first (PCGen's `PRESTAT`), the highest score otherwise; a change the file recorded where the ruleset gives no
 * increase (a manual edit, a −1) is kept in the starting score, and the report says so.
 */
export default class ScoresImport {
  constructor(
    private readonly view: RulesetView,
    private readonly imported: ImportedCharacter,
    private readonly report: ImportReport,
  ) {}

  /**
   * The view's abilities by PCGen's key for each (`STR`); one PCGen has no key for (a custom ruleset's renamed one) by
   * its name, which a level's increase can still go to.
   */
  private abilityIdsByKey() {
    const { abilities } = this.view.rulesetData;
    const byName = new Map(abilities.map((ability) => [ability.name, ability.id]));
    const ids = new Map(
      [...PCGEN_ABILITIES].flatMap(([key, name]) => (byName.has(name) ? [[key, byName.get(name)!]] : [])),
    );
    const keyed = new Set(ids.values());
    for (const ability of abilities) if (!keyed.has(ability.id)) ids.set(ability.name, ability.id);
    return ids;
  }

  /**
   * A starting score (`score`, of PCGen's key `key`) within the bounds a new character's are (`max`, `min`): one past
   * them is brought to the bound, which the report says.
   */
  private bounded(key: string, score: number, { max, min }: { max: number; min: number }) {
    const kept = Math.min(max, Math.max(min, score));
    if (kept !== score) {
      const name = PCGEN_ABILITIES.get(key) ?? key;
      this.report.issue(`${name} would start at ${score}, outside ${min} to ${max}: it starts at ${kept}`);
    }
    return kept;
  }

  /**
   * A level's increases (`due` of them), from the changes the file recorded at it (`recorded`, by key, of the ruleset's
   * abilities) first, then the highest of the file's scores (`scores`; the ruleset's first ability, `fallback`, when
   * the file holds none), which the report says: what level `levelNumber` takes, and what it leaves of the recorded
   * changes.
   */
  private takeIncreases(
    levelNumber: number,
    due: number,
    recorded: Map<string, number>,
    { fallback, scores }: { fallback: string | undefined; scores: Map<string, number> },
  ) {
    const taken = new Map<string, number>();
    let left = due;
    for (const [key, amount] of recorded) {
      if (left <= 0 || amount <= 0) continue;
      const take = Math.min(amount, left);
      taken.set(key, take);
      recorded.set(key, amount - take);
      left -= take;
    }
    if (left > 0) {
      const highest = [...scores].sort((a, b) => b[1] - a[1])[0]?.[0] ?? fallback;
      if (highest) {
        taken.set(highest, (taken.get(highest) ?? 0) + left);
        const name = PCGEN_ABILITIES.get(highest) ?? highest;
        this.report.issue(
          `Level ${levelNumber}: the file records no ability increase there: ${name} +${left}, its highest`,
        );
      }
    }
    return taken;
  }

  /**
   * The starting scores and each level's increases (`levelCount` levels, the file's first ones): the file's scores
   * less the increases placed on its levels. A score the file holds of an ability the ruleset hasn't is listed.
   */
  planScores(levelCount: number): ImportedScores {
    const ids = this.abilityIdsByKey();
    const scores = new Map<string, number>();
    for (const ability of this.imported.abilities) {
      if (ids.has(ability.key)) scores.set(ability.key, ability.score);
      else this.report.skip(ability.line, `${ability.key} isn't an ability of the ruleset`);
    }
    const rules = LevelRules.of(this.view);
    const totals = new Map<string, number>();
    const increases = this.imported.levels.slice(0, levelCount).map((level, index) => {
      const recorded = new Map<string, number>();
      for (const { amount, key } of level.abilityChanges) {
        if (ids.has(key)) recorded.set(key, (recorded.get(key) ?? 0) + amount);
        else this.report.issue(`Level ${index + 1}: ${key} isn't an ability of the ruleset: its change is left out`);
      }
      const fallback = [...ids.keys()][0];
      const taken = this.takeIncreases(index + 1, rules.countAbilityIncreases(index), recorded, { fallback, scores });
      for (const [key, amount] of recorded) {
        if (amount !== 0) {
          const change = `${PCGEN_ABILITIES.get(key) ?? key} ${formatSigned(amount)}`;
          this.report.issue(
            `Level ${index + 1}: ${change} isn't an increase the ruleset gives there: kept in the starting score`,
          );
        }
      }
      for (const [key, amount] of taken) totals.set(key, (totals.get(key) ?? 0) + amount);
      return [...taken].flatMap(([key, amount]) => (ids.has(key) ? [{ abilityId: ids.get(key)!, amount }] : []));
    });
    const bounds = NewCharacters.describeCreation(this.view).scores;
    const starting = Object.fromEntries(
      [...scores].map(([key, score]) => [ids.get(key)!, this.bounded(key, score - (totals.get(key) ?? 0), bounds)]),
    );
    const listed = ABILITY_NAMES.flatMap((name) => {
      const key = [...PCGEN_ABILITIES].find(([, candidate]) => candidate === name)?.[0];
      return key && scores.has(key) ? [`${name} ${scores.get(key)}`] : [];
    });
    this.report.import(`Ability scores: ${listed.join(", ")}`);
    return { increases, starting };
  }
}
