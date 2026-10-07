import { CowData, type Db, withCowContext } from "@/server/database/index.ts";
import { Aptitudes, EntitySnapshots, KlassLevels, RulesetEntities } from "@/server/repositories/index.ts";

type SnapshotsByRuleset = Map<string, Awaited<ReturnType<typeof EntitySnapshots.findMany>>>;

/** A ruleset's id and where its inherited entities come from. */
export type RulesetSources = { id: string; extensionRulesetIds: string[]; ancestorRulesetIds: string[] };

/**
 * Tables that participate in the name-based sibling fallback. Limited to feats and powers because those are the entity
 * types D&D sourcebooks commonly reprint (e.g. a spell appearing in CA + CD). For other entity types (races, classes,
 * abilities, saves, skills, items, languages, mechanics) a same-name match across extensions is more likely a genuine
 * collision than a reprint — auto-merging "Human" or "Fighter" between two homebrew packages would silently corrupt
 * content. Aptitudes are also excluded; they have their own name-grouping pass since name = identity universally for
 * them.
 *
 * `NAME_FALLBACK_ENTITY_TYPES` is the canonical list: `RulesetExtensionsService.assertExtensionsNameCompatible` reads
 * it too, so the runtime pairing and the subscribe-time block agree on which types pair.
 */
export const NAME_FALLBACK_ENTITY_TYPES = ["feats", "powers"] as const;

/**
 * Each group of namesakes (rows sharing a key) of more than one row: its winner, the row closest in the chain, and its
 * losers. Closest-first: extensions come before ancestors in the chain, so an extension that natively reprints a base
 * entity wins and the base's aliases to it, the same direction as the snapshots' (extension overrides base, full stop).
 */
function rankNamesakes<T extends { id: string; rulesetId: string }>(
  rows: T[],
  keyOf: (row: T) => string,
  chain: string[],
): { winner: T; losers: T[] }[] {
  const chainIndex = new Map(chain.map((id, i) => [id, i]));
  const ranked: { winner: T; losers: T[] }[] = [];
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
 * Build the combined source chain for COW lookups:
 * extensions first (their new entities are visible), then ancestors.
 */
export function buildSourceChain(ruleset: { extensionRulesetIds: string[]; ancestorRulesetIds: string[] }): string[] {
  return [...ruleset.extensionRulesetIds, ...ruleset.ancestorRulesetIds];
}

/**
 * Builds a ruleset's `CowData`: its maps, filled by passes in order, each strictly weaker than the last so earlier wins
 * are preserved.
 *
 *   1. Snapshot overrides — each source entity to its closest fork's copy (the ordinary COW model: extension wins, base
 *      aliases to extension's COW).
 *   2. Snapshot-extension siblings — when multiple extensions COW the same base entity, the non-winners become siblings
 *      of the winner.
 *   3. Name-based fallback for `NAME_FALLBACK_ENTITY_TYPES` — pairs same-name native rows across the chain when the
 *      snapshot pass didn't catch them (e.g. a spell reprinted in two D&D sourcebooks).
 *   4. A local copy's siblings become overrides of it.
 *   5. A copied class's levels, paired by number.
 *   6. The aptitudes' namesakes.
 *
 * One build (`build`), through the handle it's given: the shared `db` for a ruleset's scope, a copy's transaction for
 * the copy, so that what the copy stores (its links, its levels' grants, its siblings' merged rows) names what the
 * scope's view shows. Every override is also an alias (`override` writes both maps): an id compose skips always
 * resolves.
 */
export default class CowDataBuilder {
  constructor(ruleset: RulesetSources) {
    this.rulesetId = ruleset.id;
    this.sourceChain = buildSourceChain(ruleset);
    this.extensionRulesetIds = ruleset.extensionRulesetIds;
  }

  /**
   * A ruleset's `CowData`, read through `database`: the shared `db` for its scope's, which the cache shares with every
   * reader (`RulesetCache.getCowData`), or a copy's transaction for the copy's, which sees the transaction's own copies
   * (`EntityCopy`). It reads stored ids, copy-on-write resolution off.
   */
  static async build(database: Db, ruleset: RulesetSources): Promise<CowData> {
    return await withCowContext(undefined, async () => {
      const builder = new CowDataBuilder(ruleset);
      if (builder.sourceChain.length > 0) {
        await builder.load(database);
        await builder.pairKlassLevels(database);
      }
      if (builder.extensionRulesetIds.length > 0) await builder.pairAptitudes(database);
      return builder.toCowData();
    });
  }

  private readonly rulesetId: string;

  private readonly sourceChain: string[];

  private readonly extensionRulesetIds: string[];

  /** True overrides: compose skips each source, with its customizations. */
  private readonly overrides = new Map<string, string>();

  /** Every stale id to the id that stands for it: the overrides and the sibling losers. */
  private readonly aliases = new Map<string, string>();

  /** Each winner to its sibling losers, whose customizations merge into it. */
  private readonly siblings = new Map<string, string[]>();

  /** Appends: a winner's earlier losers (the snapshot pass's, the aptitudes') stay. */
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

  private override(sourceId: string, copyId: string) {
    this.overrides.set(sourceId, copyId);
    this.aliases.set(sourceId, copyId);
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
    return new CowData(this.sourceChain, this.overrides, this.aliases, this.siblings);
  }

  /** The snapshot and name passes, in order, through `database`: the shared `db`, or a copy's transaction. */
  private async load(database: Db) {
    const allRulesetIds = [this.rulesetId, ...this.sourceChain];
    const allSnapshots = await EntitySnapshots.findMany(database, { rulesetIds: allRulesetIds });

    // Group by rulesetId, process closest-first (allRulesetIds is already ordered closest-first)
    const byRuleset: SnapshotsByRuleset = Map.groupBy(allSnapshots, (snap) => snap.rulesetId);
    this.overrideSnapshots(allRulesetIds, byRuleset);

    const extensionSet = new Set(this.extensionRulesetIds);
    if (extensionSet.size > 0) this.pairSnapshotSiblings(allRulesetIds, byRuleset, extensionSet);

    if (extensionSet.size > 0 && this.sourceChain.length > 1) await this.pairNamesakes(database);

    const localIds = new Set((byRuleset.get(this.rulesetId) ?? []).map((s) => s.forkedEntityId));
    this.suppressLocalSiblings(localIds);
  }

  /**
   * Deduplicate aptitudes with the same name across the source chain. Each extension independently creates aptitudes
   * it needs (self-contained), so duplicates arise when multiple extensions reference the same spell list, or when an
   * extension recreates a base aptitude (e.g., "General"). Pick one winner per name; losers become its siblings
   * (compose filters them) and aliases (so FK refs to a loser remap to the winner). Intentionally not overrides —
   * compose-skip is for true overrides only.
   */
  private async pairAptitudes(database: Db) {
    const allAptitudes = await Aptitudes.findMany(database, { rulesetIds: this.sourceChain });
    for (const { winner, losers } of rankNamesakes(allAptitudes, (apt) => apt.name, this.sourceChain)) {
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
   * Klass-level id pairs for COW'd klasses: levels aren't individually snapshotted, so they pair by level number, as
   * overrides, so that a stored klass-level id resolves to the copy's.
   */
  private async pairKlassLevels(database: Db) {
    if (this.overrides.size === 0) return;
    const klassSnaps = await EntitySnapshots.findMany(database, { rulesetId: this.rulesetId, entityType: "klasses" });
    const klassIds = klassSnaps.flatMap((snap) => [snap.sourceEntityId, snap.forkedEntityId]);
    const levelsByKlass = Map.groupBy(await KlassLevels.findMany(database, { klassIds }), (level) => level.klassId);
    for (const snap of klassSnaps) {
      const childLevels = levelsByKlass.get(snap.forkedEntityId) ?? [];
      for (const parentLevel of levelsByKlass.get(snap.sourceEntityId) ?? []) {
        const childLevel = childLevels.find((l) => l.level === parentLevel.level);
        if (childLevel) this.override(parentLevel.id, childLevel.id);
      }
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
  private async pairNamesakes(database: Db) {
    const rows = await RulesetEntities.findNativeNames(database, {
      rulesetIds: this.sourceChain,
      entityTypes: [...NAME_FALLBACK_ENTITY_TYPES],
    });
    for (const { winner, losers } of rankNamesakes(rows, (row) => `${row.entityType}|${row.name}`, this.sourceChain)) {
      for (const loser of losers) this.alias(loser.id, winner.id);
      this.addSiblings(
        winner.id,
        losers.map((l) => l.id),
      );
    }
  }
}
