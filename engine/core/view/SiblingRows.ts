import type { CowData } from "@/engine/core/cow/index.ts";

/** A winner's rows of one kind, and each of its sibling losers', for a merge rule (`siblingMerge.ts`). */
export interface SiblingGroup<T> {
  own: T[];
  siblings: T[][];
  winnerId: string;
}

/**
 * A composed list of one kind, as compose walks the chain (`RulesetComposition`), and the rows of it a sibling merge
 * reads: the sibling losers' and their winners', by owner. The list comes back with the losers' rows merged.
 */
export default class SiblingRows<T> {
  constructor(cow: CowData) {
    this.cow = cow;
  }

  private readonly cow: CowData;

  private readonly losers: { index: number; winnerId: string }[] = [];

  private readonly rows: T[] = [];

  private readonly rowsByOwner = new Map<string, T[]>();

  private readonly winnerIds = new Set<string>();

  /**
   * The rows in their order, each loser's replaced by what `replace` gives for it, or left out: the list compacted in
   * place, from the first loser's row on.
   */
  private replaceLosers(replace: (row: T, winnerId: string) => T | undefined): T[] {
    const { rows, losers } = this;
    if (losers.length === 0) return rows;
    let kept = losers[0].index;
    let next = 0;
    for (let index = kept; index < rows.length; index++) {
      if (next < losers.length && losers[next].index === index) {
        const replacement = replace(rows[index], losers[next++].winnerId);
        if (replacement) rows[kept++] = replacement;
      } else {
        rows[kept++] = rows[index];
      }
    }
    rows.length = kept;
    return rows;
  }

  /** Adds `row`, of `ownerId`'s, to the list, gathering it when its owner is a sibling loser or a winner of one. */
  add(row: T, ownerId: string) {
    this.rows.push(row);
    if (this.cow.siblingIds.size === 0) return;
    const winnerId = this.cow.getWinner(ownerId);
    if (winnerId) {
      this.losers.push({ index: this.rows.length - 1, winnerId });
      this.winnerIds.add(winnerId);
    } else if (!this.cow.hasSiblings(ownerId)) {
      return;
    }
    const owned = this.rowsByOwner.get(ownerId);
    if (owned) owned.push(row);
    else this.rowsByOwner.set(ownerId, [row]);
  }

  /**
   * Each winner a loser's row merges into, the first one's first: its own rows and each loser's, in the order its
   * `CowData` pairs them (`getSiblings`).
   */
  getGroups(): SiblingGroup<T>[] {
    return [...this.winnerIds].map((winnerId) => ({
      winnerId,
      own: this.rowsByOwner.get(winnerId) ?? [],
      siblings: this.cow.getSiblings(winnerId).map((loserId) => this.rowsByOwner.get(loserId) ?? []),
    }));
  }

  /** The list, each loser's row its winner takes (`taken`) moved to it in its place, the losers' others out: once. */
  moveTaken(taken: ReadonlySet<T>, moveTo: (row: T, winnerId: string) => T): T[] {
    return this.replaceLosers((row, winnerId) => (taken.has(row) ? moveTo(row, winnerId) : undefined));
  }

  /** The list without the losers' rows, then `merged`, what a merge rule made of them: once. */
  withMerged(merged: T[]): T[] {
    return this.replaceLosers(() => undefined).concat(merged);
  }
}
