import LiteralValue from "@/engine/core/paths/LiteralValue.ts";

/** A modifier a class level keeps or a progression's save writes on it: a stored one's id, and whether it's gated. */
export interface LevelModifier {
  /** Requirements gate it: a progression's save leaves it as it is */
  gated: boolean;
  id?: string;
  operator: string;
  target: string;
  value: string;
}

/** A level's modifier as a table reads it, with its level (`sourceId`). */
export interface TableModifier {
  operator: string;
  sourceId: string;
  target: string;
  value: string;
}

/** How a modifier steps a table's total of a key (`key`, a column's): its step on the total so far. */
export interface TableStep<V> {
  key: string | number;
  step: (total: V | undefined) => V;
}

/** A column's total at a level: none (`undefined`), a count, or every one ("All"). */
export type ColumnTotal = number | "All" | undefined;

/**
 * A class's progression table, as its levels' modifiers keep it (each level's increase) and its page shows it (each
 * level's total): what every ruleset's progression shares, naming no game. A ruleset says what its tables count and
 * how a modifier steps them; these add the levels' modifiers up into totals (`computeRunning`), and turn a save's
 * totals back into each level's modifiers (`planColumn`, `replaceOwn`).
 */
export default class ProgressionColumns {
  /**
   * Each level's running totals by key, by its id: each of its modifiers (`modifiers`, by their `sourceId`, its level)
   * steps the total of the key it counts toward (`stepOf`; none counts toward no key), over the levels by their number.
   */
  static computeRunning<V>(
    levels: { id: string; position: number }[],
    modifiers: TableModifier[],
    stepOf: (modifier: TableModifier) => TableStep<V> | undefined,
  ): Map<string, Record<string | number, V>> {
    const stepsByLevelId = Map.groupBy(
      modifiers.flatMap((modifier) => {
        const step = stepOf(modifier);
        return step ? [{ ...step, levelId: modifier.sourceId }] : [];
      }),
      (step) => step.levelId,
    );
    const totals: Record<string | number, V> = {};
    const totalsByLevelId = new Map<string, Record<string | number, V>>();
    for (const level of levels.toSorted((a, b) => a.position - b.position)) {
      for (const { key, step } of stepsByLevelId.get(level.id) ?? []) totals[key] = step(totals[key]);
      totalsByLevelId.set(level.id, { ...totals });
    }
    return totalsByLevelId;
  }

  /** Whether a modifier adds a number, ungated: what a progression's save writes, and rewrites, of a level's own. */
  static isPlainAdd(modifier: LevelModifier) {
    return (
      !modifier.gated && modifier.operator === "add" && typeof LiteralValue.parse(modifier.value, "number") === "number"
    );
  }

  /** A column's totals as a table reads them: none until its first count, then 0 for none, and "All" once it's all. */
  static normalizedColumn(column: ColumnTotal[]): ColumnTotal[] {
    let counted = false;
    let all = false;
    return column.map((total) => {
      all ||= total === "All";
      counted ||= total !== undefined;
      if (all) return "All";
      return total ?? (counted ? 0 : undefined);
    });
  }

  /**
   * The modifiers a table's column (`target`, what it counts: a spell level's) gives each level, for the totals it's asked
   * (`wanted`, normalized) over what the levels' other modifiers give (`kept`): each level adds what its total gains on
   * the level before; a column counted from a level the others give nothing at opens there with 0; "All" sets it once,
   * to the ruleset's value for every one (`allValue`: a spell list's spells known all).
   * A level the others already give "All" at (a gated one's, perhaps) keeps its own as they are (`undefined`).
   */
  static planColumn(
    target: string,
    wanted: ColumnTotal[],
    kept: ColumnTotal[],
    allValue: number,
  ): (LevelModifier[] | undefined)[] {
    let given = 0;
    let open = false;
    let all = false;
    return wanted.map((total, index) => {
      const other = kept[index];
      if (other === "All") return all ? [] : undefined;
      if (all || total === undefined) return [];
      if (total === "All") {
        all = true;
        return [ProgressionColumns.planned(target, "set", allValue)];
      }
      const need = total - (other ?? 0);
      const gain = need - given;
      given = need;
      const opens = !open && other === undefined;
      open = true;
      return gain !== 0 || opens ? [ProgressionColumns.planned(target, "add", gain)] : [];
    });
  }

  /** A modifier a progression's save writes. */
  static planned(target: string, operator: "add" | "set", value: number): LevelModifier {
    return { gated: false, operator, target, value: String(value) };
  }

  /**
   * The levels' modifiers as a save plans them (`working`, by the level each is on), as a class's table reads them: those
   * it keeps (`keep`: all of them), each with its level (`sourceId`).
   */
  static readTableModifiers(
    working: Map<string, LevelModifier[]>,
    keep: (modifier: LevelModifier) => boolean = () => true,
  ): TableModifier[] {
    return [...working].flatMap(([sourceId, levelModifiers]) =>
      levelModifiers.filter(keep).map((modifier) => ({ ...modifier, sourceId })),
    );
  }

  /**
   * Swaps the modifiers of a level that a save rewrites (`isOwn`) for the ones it plans (`next`), unless they already say
   * the same: a level whose own modifiers stand keeps them, and writes nothing. Answers whether it swapped them.
   */
  static replaceOwn(
    working: Map<string, LevelModifier[]>,
    levelId: string,
    isOwn: (modifier: LevelModifier) => boolean,
    next: LevelModifier[],
  ) {
    const modifiers = working.get(levelId) ?? [];
    const own = modifiers.filter(isOwn);
    const same = (a: LevelModifier, b: LevelModifier) =>
      a.target === b.target && a.operator === b.operator && Number(a.value) === Number(b.value);
    if (own.length === next.length && own.every((modifier, index) => same(modifier, next[index]))) return false;
    working.set(levelId, [...modifiers.filter((modifier) => !isOwn(modifier)), ...next]);
    return true;
  }
}
