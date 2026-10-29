import CowData from "./CowData.ts";
import CowSources, { type CowRows, type RulesetSources } from "./CowSources.ts";

type SnapshotsByRuleset = Map<string, CowRows["snapshots"]>;

/**
 * Each group of namesakes (rows sharing a key) of more than one row: its winner, the row closest in the chain, and its
 * losers. Closest-first: extensions come before the parent in the chain, so an extension that natively reprints a base
 * entity wins and the base's aliases to it, the same direction as the snapshots' (extension overrides base, full stop).
 */
function rankNamesakes<T extends { id: string; rulesetId: string }>(
  rows: T[],
  keyOf: (row: T) => string,
  chain: string[],
): { losers: T[]; winner: T }[] {
  const chainIndex = new Map(chain.map((id, i) => [id, i]));
  const ranked: { losers: T[]; winner: T }[] = [];
  for (const group of Map.groupBy(rows, keyOf).values()) {
    if (group.length <= 1) continue;
    const [winner, ...losers] = group.sort(
      (a, b) => (chainIndex.get(a.rulesetId) ?? 999) - (chainIndex.get(b.rulesetId) ?? 999),
    );
    ranked.push({ winner, losers });
  }
  return ranked;
}

/**
 * Builds a ruleset's `CowData`: its maps, filled by passes in order, each strictly weaker than the last so earlier wins
 * are preserved.
 *
 *   1. Snapshot overrides — each source entity to its closest fork's copy (the ordinary COW model: extension wins, base
 *      aliases to extension's COW).
 *   2. Snapshot-extension siblings — when multiple extensions COW the same base entity, the non-winners become siblings
 *      of the winner.
 *   3. Name-based fallback for the kinds a book reprints (`CowKinds.reprints`) — pairs same-name native rows across the
 *      chain when the snapshot pass didn't catch them (e.g. a spell reprinted in two D&D sourcebooks).
 *   4. A local copy's siblings become overrides of it.
 *   5. The namesakes of the kinds a name is the identity of (`CowKinds.identities`: 3.5's pools).
 *   6. The ruleset's own entities over its extensions' of their names — an extension's entity of a name the ruleset's
 *      own has is overridden by it (a homebrew feat a book's author named as the ruleset's since it subscribed).
 *   7. The owned entities of an owner another stands for (a copy in the chain, to its last copy; an extension's owner
 *      the ruleset's own hides), paired by position with that owner's (3.5's class levels, by level).
 *
 * One build (`build`), from the rows the server reads for it (`CowSources.getReads`) through the handle its caller
 * holds: the shared `db` for a ruleset's scope, a copy's transaction for the copy, so that what the copy stores (its
 * links, its levels' grants, its siblings' merged rows) names what the scope's view shows. Every override is also an
 * alias (`override` writes both maps): an id compose skips always resolves.
 */
export default class CowDataBuilder {
  constructor(ruleset: RulesetSources) {
    this.rulesetId = ruleset.id;
    this.sourceChain = CowSources.buildSourceChain(ruleset);
    this.extensionIds = ruleset.extensionIds;
  }

  /** A ruleset's `CowData`, from its rows: the stored ids the server reads, copy-on-write resolution off. */
  static build(ruleset: RulesetSources, rows: CowRows): CowData {
    const builder = new CowDataBuilder(ruleset);
    if (builder.sourceChain.length > 0) builder.load(rows);
    if (builder.extensionIds.length > 0) {
      builder.pairIdentities(rows);
      builder.overrideOwnNamesakes(rows);
    }
    if (builder.sourceChain.length > 0) builder.pairOwned(rows);
    return builder.toCowData();
  }

  /** Every stale id to the id that stands for it: the overrides and the sibling losers. */
  private readonly aliases = new Map<string, string>();

  private readonly extensionIds: string[];

  /** True overrides: compose skips each source, with its customizations. */
  private readonly overrides = new Map<string, string>();

  private readonly rulesetId: string;

  /** An extension's entity the ruleset's own of its name hides, to that one. */
  private readonly shadows = new Map<string, string>();

  /** Each winner to its sibling losers, whose customizations merge into it. */
  private readonly siblings = new Map<string, string[]>();

  private readonly sourceChain: string[];

  /** Appends: a winner's earlier losers (the snapshot pass's, the identities') stay. */
  private addSiblings(winnerId: string, loserIds: string[]) {
    const existing = this.siblings.get(winnerId) ?? [];
    this.siblings.set(winnerId, [...existing, ...loserIds]);
  }

  /**
   * A sibling loser resolves to its winner, so a stale reference (a stored pick whose feat is now a loser) resolves:
   * not an override, since compose merges its customizations into the winner. A stale id keeps its first alias.
   */
  private alias(staleId: string, id: string) {
    if (!this.aliases.has(staleId)) this.aliases.set(staleId, id);
  }

  /** The snapshot, sibling and reprint passes, in order, then a local copy's siblings made its overrides. */
  private load(rows: CowRows) {
    const allRulesetIds = [this.rulesetId, ...this.sourceChain];

    // Group by rulesetId, process closest-first (allRulesetIds is already ordered closest-first)
    const byRuleset: SnapshotsByRuleset = Map.groupBy(rows.snapshots, (snap) => snap.rulesetId);
    this.overrideSnapshots(allRulesetIds, byRuleset);

    const extensionSet = new Set(this.extensionIds);
    if (extensionSet.size > 0) this.pairSnapshotSiblings(allRulesetIds, byRuleset, extensionSet);

    if (extensionSet.size > 0 && this.sourceChain.length > 1) this.pairNamesakes(rows);

    const localIds = new Set((byRuleset.get(this.rulesetId) ?? []).map((s) => s.forkedEntityId));
    this.suppressLocalSiblings(localIds);
  }

  private override(sourceId: string, copyId: string) {
    this.overrides.set(sourceId, copyId);
    this.aliases.set(sourceId, copyId);
  }

  /**
   * The ruleset's own entities win over its extensions' of their names, of every type: an extension's entity named as
   * one of the ruleset's (one its author added or renamed since the ruleset subscribed, which a subscribe refuses) is
   * overridden by the ruleset's, as a local copy overrides what it copied. Its own rows go with it (its customizations,
   * its links to lists), never merged: a homebrew entity and a book's of one name may be different things. What stood
   * for it stands for the ruleset's entity now (what it copied, its sibling losers), so a row naming any of them (a
   * book's class granting it, a character's pick) reads the ruleset's. An extension's entity the view already hides
   * (one the ruleset copied, a pool paired by name) stays as it is. Of the ruleset's own entities of a name, the first
   * stands.
   */
  private overrideOwnNamesakes(rows: CowRows) {
    const key = (row: CowRows["ownNamesakes"][number]) => `${row.entityType}|${row.name}`;
    const own = new Map<string, string>();
    for (const row of rows.ownNamesakes)
      if (row.rulesetId === this.rulesetId && !own.has(key(row))) own.set(key(row), row.id);

    const loserIds = new Set([...this.siblings.values()].flat());
    for (const row of rows.ownNamesakes) {
      const ownId = own.get(key(row));
      if (!ownId || row.rulesetId === this.rulesetId || this.overrides.has(row.id) || loserIds.has(row.id)) continue;
      for (const [staleId, id] of this.aliases) if (id === row.id) this.aliases.set(staleId, ownId);
      for (const [sourceId, copyId] of this.overrides) if (copyId === row.id) this.overrides.set(sourceId, ownId);
      for (const loserId of this.siblings.get(row.id) ?? []) this.override(loserId, ownId);
      this.override(row.id, ownId);
      this.shadows.set(row.id, ownId);
    }
  }

  /** The true overrides: each source entity to its closest fork's copy, following a copy of a copy to the last. */
  private overrideSnapshots(allRulesetIds: string[], byRuleset: SnapshotsByRuleset) {
    for (const rid of allRulesetIds) {
      for (const snap of byRuleset.get(rid) ?? []) {
        if (!this.overrides.has(snap.sourceEntityId))
          this.override(snap.sourceEntityId, this.overrides.get(snap.forkedEntityId) ?? snap.forkedEntityId);
      }
    }
  }

  /**
   * Deduplicate the entities of a kind a name is the identity of (3.5's pools) across the ruleset and its source chain.
   * Each extension independently creates those it needs (self-contained), so duplicates arise when multiple extensions
   * reference the same spell list, when an extension recreates a base pool (e.g., "General"), or when the ruleset has
   * one (its own, or its copy of an inherited one) of a name one of its books has. Pick one winner per kind and name,
   * the ruleset's own first, then the chain's closest; losers become its siblings (compose filters them) and aliases
   * (so FK refs to a loser remap to the winner). Intentionally not overrides — compose-skip is for true overrides only.
   */
  private pairIdentities(rows: CowRows) {
    const rulesetIds = [this.rulesetId, ...this.sourceChain];
    const key = (row: CowRows["identities"][number]) => `${row.entityType}|${row.name}`;
    for (const { winner, losers } of rankNamesakes(rows.identities, key, rulesetIds)) {
      // Aliases must point directly to the visible copy, including a local COW.
      const resolvedWinnerId = this.aliases.get(winner.id) ?? winner.id;
      for (const loser of losers) this.alias(loser.id, resolvedWinnerId);
      this.addSiblings(
        winner.id,
        losers.map((l) => l.id),
      );
    }
  }

  /**
   * Name-based sibling fallback for same-name reprints. When two rulesets in
   * the source chain natively define entities with the same name without
   * sharing a sourceEntityId (e.g. a spell reprinted in two D&D sourcebooks,
   * or a user extension that re-introduces a spell from another extension to
   * attach it to a custom class list), pair them as siblings so compose merges
   * them and `EntityCopy` bakes their data into a child fork's COW. Last-resort
   * only — rows already paired via entitySnapshotsInRules are excluded so the
   * snapshot-based pass always wins. Worst-case for an unwanted merge between
   * unrelated user extensions: the merged entity looks weird; the user can COW
   * it and edit. Recoverable, not data loss.
   */
  private pairNamesakes(rows: CowRows) {
    const key = (row: CowRows["namesakes"][number]) => `${row.entityType}|${row.name}`;
    for (const { winner, losers } of rankNamesakes(rows.namesakes, key, this.sourceChain)) {
      for (const loser of losers) this.alias(loser.id, winner.id);
      this.addSiblings(
        winner.id,
        losers.map((l) => l.id),
      );
    }
  }

  /**
   * Owned entities' id pairs: owned entities aren't individually snapshotted, so those of each owner another stands for
   * in the view pair by position with that owner's of their kind (3.5's class levels, by level), as overrides, so that
   * a stored owned id resolves to the one the view shows: an owner a copy of the source chain overrides (an extension's
   * copy of a core class), followed to the last copy as an entity id is (the ruleset's copy of that copy), and an
   * extension's owner the ruleset's own of its name hides. One the owner standing for its owner doesn't have pairs with
   * none.
   */
  private pairOwned(rows: CowRows) {
    const key = (entityType: string, ownerId: string) => `${entityType}|${ownerId}`;
    const byOwner = Map.groupBy(rows.owned, (owned) => key(owned.entityType, owned.ownerId));
    for (const owned of byOwner.values()) {
      const [{ entityType, ownerId }] = owned;
      const standingId = this.aliases.get(ownerId);
      const standingOwned = standingId === undefined ? [] : (byOwner.get(key(entityType, standingId)) ?? []);
      for (const entity of owned) {
        const standing = standingOwned.find((other) => other.position === entity.position);
        if (standing) this.override(entity.id, standing.id);
      }
    }
  }

  /**
   * Pairs snapshot siblings: when multiple snapshots share a sourceEntityId, the winner's forkedEntityId maps to the
   * sibling-loser forkedEntityIds. The winner can be either an extension's COW or the child fork's own COW. Local
   * winners are converted to true overrides after both pairing passes, so their customizations are not merged again on
   * reads.
   */
  private pairSnapshotSiblings(allRulesetIds: string[], byRuleset: SnapshotsByRuleset, extensionSet: Set<string>) {
    const bySource: SnapshotsByRuleset = new Map();
    // Match compose's source-chain order when choosing duplicate sibling
    // contributions. The snapshot query has no ordering guarantee.
    for (const rid of allRulesetIds) {
      for (const snap of byRuleset.get(rid) ?? []) {
        const group = bySource.get(snap.sourceEntityId) ?? [];
        group.push(snap);
        bySource.set(snap.sourceEntityId, group);
      }
    }

    for (const [sourceId, snaps] of bySource) {
      if (snaps.length <= 1) continue;
      const winnerId = this.overrides.get(sourceId);
      if (!winnerId) continue;
      // Sibling losers are extension shadows that aren't the winner. Works in
      // both the direct case (winner is one of these snaps) and the chained
      // case (winner reached via a closer snapshot whose source links into
      // this group).
      const siblingIds = snaps
        .filter((s) => s.forkedEntityId !== winnerId && extensionSet.has(s.rulesetId))
        .map((s) => s.forkedEntityId);
      if (siblingIds.length === 0) continue;
      this.addSiblings(winnerId, siblingIds);
      for (const siblingId of siblingIds) this.alias(siblingId, winnerId);
    }
  }

  /**
   * A local COW already owns its customizations. Keep sibling IDs resolvable,
   * but suppress their source rows instead of merging them back into the copy.
   * Include tombstones so deleting the local entity cannot revive a sibling.
   */
  private suppressLocalSiblings(localIds: Set<string>) {
    for (const [winnerId, siblingIds] of this.siblings) {
      const resolvedId = this.aliases.get(winnerId) ?? winnerId;
      if (!localIds.has(resolvedId)) continue;
      for (const siblingId of siblingIds) this.override(siblingId, resolvedId);
    }
  }

  private toCowData(): CowData {
    return new CowData(this.sourceChain, this.overrides, this.aliases, this.siblings, new Set(this.shadows.keys()));
  }
}
