/**
 * A ruleset's copy-on-write state: what its scope's reads resolve ids through (`withCowContext`), built by the cache
 * (`CowDataBuilder`). An entity a later ruleset copied is overridden: its copy stands for it, and its customizations
 * are the copy's. A book's copy of an entity another book copied too is a sibling loser: the winner stands for it, and
 * its customizations merge into the winner's. Every stale id (an overridden one, a sibling loser) resolves to the id
 * that stands for it.
 */
export default class CowData {
  /**
   * `overrides` maps each overridden id to its copy, `aliases` every stale id to the id that stands for it (each
   * override among them), `siblings` each winner to its sibling losers, in the order they were paired.
   */
  constructor(
    sourceChain: string[],
    overrides: ReadonlyMap<string, string>,
    aliases: ReadonlyMap<string, string>,
    siblings: ReadonlyMap<string, readonly string[]>,
  ) {
    this.sourceChain = sourceChain;
    this.overrides = overrides;
    this.aliases = aliases;
    this.siblings = siblings;
    this.siblingIds = new Set([...siblings.values()].flat());
    this.stateId = String(++CowData.lastStateId);
    // A loser paired under two winners belongs to the later one
    for (const [winnerId, loserIds] of siblings) {
      for (const loserId of loserIds) this.winners.set(loserId, winnerId);
    }
  }

  private static lastStateId = 0;

  /** The ruleset's extensions, then its ancestors: where its inherited entities come from. */
  readonly sourceChain: string[];

  /**
   * A short id of its own, one per built CowData, so that a request's reads in two copy-on-write states (a
   * character's ruleset and another's) never share a cached result.
   */
  readonly stateId: string;

  /** Every sibling loser. */
  readonly siblingIds: ReadonlySet<string>;

  private readonly overrides: ReadonlyMap<string, string>;

  private readonly aliases: ReadonlyMap<string, string>;

  private readonly siblings: ReadonlyMap<string, readonly string[]>;

  private readonly winners = new Map<string, string>();

  /** Every id that resolves to the entity `id` resolves to, that entity's own first: a stored row may hold any. */
  getEquivalentIds(id: string): string[] {
    const target = this.resolve(id);
    const ids = new Set([target]);
    for (const [staleId, resolvedId] of this.aliases) {
      if (resolvedId === target) ids.add(staleId);
    }
    return [...ids];
  }

  /** The sibling losers that merge into `winnerId`, in the order they were paired. */
  getSiblings(winnerId: string): string[] {
    return [...(this.siblings.get(winnerId) ?? [])];
  }

  /** The stale ids: those another id stands for. */
  getStaleIds(): string[] {
    return [...this.aliases.keys()];
  }

  /** The winner a sibling loser merges into: its stored id, which may itself be overridden by a local copy. */
  getWinner(loserId: string): string | undefined {
    return this.winners.get(loserId);
  }

  /** Whether `winnerId` has sibling losers that merge into it. */
  hasSiblings(winnerId: string): boolean {
    return this.siblings.has(winnerId);
  }

  /** Whether the scope resolves no id: a ruleset that copied nothing and pairs no siblings. */
  isEmpty(): boolean {
    return this.aliases.size === 0;
  }

  /** Whether the ruleset's view leaves the entity out: overridden by a copy, or a sibling loser. */
  isHidden(id: string): boolean {
    return this.isOverridden(id) || this.siblingIds.has(id);
  }

  /** Whether a later ruleset copied the entity: its copy stands for it, its customizations with it. */
  isOverridden(id: string): boolean {
    return this.overrides.has(id);
  }

  /** The id that stands for `id`: its copy or its winner when it's stale, itself otherwise. */
  resolve(id: string): string {
    return this.aliases.get(id) ?? id;
  }

  /**
   * Rows with every string field naming a stale id resolved (`abilityId`, `parentId`, `sourceItemId`…): the same array
   * when the scope resolves nothing.
   */
  resolveRows<T extends Record<string, unknown>>(rows: T[]): T[] {
    if (this.isEmpty()) return rows;
    return rows.map((row) => {
      const resolved = { ...row };
      for (const [key, value] of Object.entries(resolved)) {
        if (typeof value === "string" && this.aliases.has(value)) {
          (resolved as Record<string, unknown>)[key] = this.aliases.get(value);
        }
      }
      return resolved;
    });
  }
}
