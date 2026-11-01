/**
 * A ruleset's copy-on-write state: what reading its stored rows as its view does resolves ids through, built by the engine
 * (`CowDataBuilder`) from the rows copy-on-write's views read. An entity a later ruleset copied is overridden: its copy
 * stands for it, and its customizations are the copy's. So is a book's entity of a name the ruleset's own has: the
 * ruleset's stands for it (it's shadowed). A book's copy of an entity another book copied too is a sibling loser: the
 * winner stands for it, and its customizations merge into the winner's. Every stale id (an overridden one, a sibling
 * loser) resolves to the id that stands for it.
 */
export default class CowData {
  /**
   * `overrides` maps each overridden id to its copy, `aliases` every stale id to the id that stands for it (each
   * override among them), `siblings` each winner to its sibling losers, in the order they were paired. A loser paired
   * twice is listed once, where it was paired under the later winner. `shadowedIds`: the overridden books' entities the
   * ruleset's own of their names stands for. `sources`: each copy the chain's snapshots record, to the entity it
   * copied. `snapshotRulesetIds`: the rulesets whose snapshots override what they copied, the ruleset's and its
   * chain's (`CowSources.getReads`).
   */
  constructor(
    sourceChain: string[],
    overrides: ReadonlyMap<string, string>,
    aliases: ReadonlyMap<string, string>,
    siblings: ReadonlyMap<string, readonly string[]>,
    shadowedIds: ReadonlySet<string>,
    sources: ReadonlyMap<string, string> = new Map(),
    snapshotRulesetIds: readonly string[] = [],
  ) {
    this.sourceChain = sourceChain;
    this.snapshotRulesetIds = snapshotRulesetIds;
    this.overrides = overrides;
    this.aliases = aliases;
    this.shadowedIds = shadowedIds;
    this.sources = sources;
    for (const [winnerId, loserIds] of siblings) for (const loserId of loserIds) this.winners.set(loserId, winnerId);

    const losersOf = new Map<string, string[]>();
    for (const [winnerId, loserIds] of siblings) {
      const own = [...new Set(loserIds)].filter((loserId) => this.winners.get(loserId) === winnerId);
      if (own.length > 0) losersOf.set(winnerId, own);
    }
    this.siblings = losersOf;
    this.siblingIds = new Set(this.winners.keys());
  }

  private readonly aliases: ReadonlyMap<string, string>;

  private readonly overrides: ReadonlyMap<string, string>;

  private readonly shadowedIds: ReadonlySet<string>;

  private readonly siblings: ReadonlyMap<string, readonly string[]>;

  private readonly snapshotRulesetIds: readonly string[];

  private readonly sources: ReadonlyMap<string, string>;

  private readonly winners = new Map<string, string>();

  /** Every sibling loser. */
  readonly siblingIds: ReadonlySet<string>;

  /** The ruleset's extensions, then its parent: where its inherited entities come from. */
  readonly sourceChain: string[];

  /** Every id that resolves to the entity `id` resolves to, that entity's own first: a stored row may hold any. */
  getEquivalentIds(id: string): string[] {
    const target = this.resolve(id);
    const ids = new Set([target]);
    for (const [staleId, resolvedId] of this.aliases) if (resolvedId === target) ids.add(staleId);

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

  /**
   * Whether a later ruleset copied the entity, or the ruleset's own entity of its name shadows it: its copy (the
   * ruleset's) stands for it, its customizations with it.
   */
  isOverridden(id: string): boolean {
    return this.overrides.has(id);
  }

  /**
   * Whether the ruleset's own entity of its name hides the entity, a book's: it stands for it, as a copy stands for what
   * it copied. A subscribe counts it as the view would show it but for the ruleset's own (`EntityNames`).
   */
  isShadowed(id: string): boolean {
    return this.shadowedIds.has(id);
  }

  /**
   * What a list of the ruleset's entities reads besides its own rows: its source chain's (`sourceChain`), less what the
   * view hides, which it leaves out in the query, so a page keeps its size: what a snapshot overrides (the sources of
   * `snapshotRulesetIds`' snapshots, whichever of the chain copied them), and what none does (`hiddenIds`: the sibling
   * losers, the shadowed books' entities).
   */
  get listFilters() {
    return {
      sourceChain: this.sourceChain,
      snapshotRulesetIds: [...this.snapshotRulesetIds],
      hiddenIds: [...this.siblingIds, ...this.shadowedIds],
    };
  }

  /** The id that stands for `id`: its copy or its winner when it's stale, itself otherwise. */
  resolve(id: string): string {
    return this.aliases.get(id) ?? id;
  }

  /** A link (`link`, as stored) naming the entities that stand for its target and its pool (a copy, a winner). */
  resolveLink<T extends { toId: string; viaId: string | null }>(link: T): T {
    return { ...link, toId: this.resolve(link.toId), viaId: link.viaId === null ? null : this.resolve(link.viaId) };
  }

  /**
   * Entities (`entities`: records, as stored or as a view holds them) with each single link naming the entity that
   * stands for its target (a copy, a winner): the same array when the scope resolves nothing, and the same entity when
   * its links name no stale id (or it carries none: a picker's option read by its name alone).
   */
  resolveLinks<T extends { links?: Readonly<Partial<Record<string, string>>> }>(entities: readonly T[]): T[] {
    if (this.isEmpty()) return entities as T[];
    return entities.map((entity) => {
      const links = Object.entries(entity.links ?? {});
      if (links.every(([, toId]) => toId === undefined || !this.aliases.has(toId))) return entity;
      return {
        ...entity,
        links: Object.fromEntries(links.map(([role, toId]) => [role, toId === undefined ? toId : this.resolve(toId)])),
      };
    });
  }

  /**
   * The entity a copy copied (`copyId`, as stored), as its snapshot records it: none for one that copies none (a
   * ruleset's own entity, a book's reprint of another's).
   */
  sourceOf(copyId: string): string | undefined {
    return this.sources.get(copyId);
  }
}
