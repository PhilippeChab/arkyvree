/**
 * How a module's kinds pair in a ruleset's chain, by its storage: those a name is the identity of (`identities`: 3.5's
 * pools), those a book reprints, which pair by name when no copy pairs them (`reprints`: 3.5's feats and spells), those
 * that own another kind (`owners`: 3.5's classes), and the kinds they own (`owned`: 3.5's class levels, which pair by
 * position with those of the class that stands for theirs).
 */
export interface CowKinds {
  identities: string[];
  owned: string[];
  owners: string[];
  reprints: string[];
}

/**
 * The rows a ruleset's `CowData` is built from (`CowDataBuilder.build`), as stored, which the server reads as
 * `CowSources.getReads` says: its snapshots, and its source chain's, the owned entities of the owners it copied or its
 * own entities hide (`owned`: each its kind, its owner and its position in it), the chain's native namesakes of the
 * kinds a book reprints, the ruleset's entities and its extensions' of a name both have, and the entities of the kinds
 * a name is the identity of, its own and the chain's (`identities`).
 */
export interface CowRows {
  identities: { entityType: string; id: string; name: string; rulesetId: string }[];
  namesakes: { entityType: string; id: string; name: string; rulesetId: string }[];
  owned: { entityType: string; id: string; ownerId: string; position: number }[];
  ownNamesakes: { entityType: string; id: string; name: string; rulesetId: string }[];
  snapshots: { entityType: string; forkedEntityId: string; rulesetId: string; sourceEntityId: string }[];
}

/** A ruleset's id and where its inherited entities come from. */
export interface RulesetSources {
  ancestorRulesetIds: string[];
  extensionRulesetIds: string[];
  id: string;
}

/** Where a ruleset's copy-on-write data comes from: its source chain, and the rows it's built from. */
export default class CowSources {
  /**
   * Build the combined source chain for COW lookups:
   * extensions first (their new entities are visible), then ancestors.
   */
  static buildSourceChain(ruleset: { ancestorRulesetIds: string[]; extensionRulesetIds: string[] }): string[] {
    return [...ruleset.extensionRulesetIds, ...ruleset.ancestorRulesetIds];
  }

  /**
   * The owners whose owned entities pair by position (`owners`: their kinds): those the ruleset and its source chain
   * copied (their snapshots say: an extension's copy of a core class, the ruleset's copy of that copy) and their
   * sources, and those of its own and its extensions' of a name both have (`ownNamesakes`), whose owned entities pair
   * when its own hides theirs.
   */
  static getPairedOwnerIds(rows: Pick<CowRows, "ownNamesakes" | "snapshots">, owners: readonly string[]) {
    return [
      ...rows.snapshots
        .filter((snap) => owners.includes(snap.entityType))
        .flatMap((snap) => [snap.sourceEntityId, snap.forkedEntityId]),
      ...rows.ownNamesakes.filter((row) => owners.includes(row.entityType)).map((row) => row.id),
    ];
  }

  /**
   * What a ruleset's `CowData` is read from, each read none when it needs none, by how its module's kinds pair
   * (`kinds`): its snapshots and its chain's, when it has a chain (a ruleset with none copies nothing); the entities of
   * the kinds a name is the identity of, its own and its chain's, its own first, which pair by name when it has
   * extensions (its own pools with its books' too); its chain's native namesakes of the kinds a book reprints, when its
   * extensions and ancestors make more than one source (a same-name match of any other kind, a race or a class, is more
   * likely two things than a reprint, and pairing them would merge them); and, when it has extensions, its own entities
   * and theirs of a name both have, of every kind (`ownNamesakes`: its own hide theirs). The owned entities of the
   * owners it copied or its own hide follow from those (`getPairedOwnerIds`). A subscribe reads the view's pairing as
   * it builds it (`EntityNames`, the server's), so it refuses what the view would show twice, never what it pairs.
   */
  static getReads(ruleset: RulesetSources, kinds: CowKinds) {
    const chain = CowSources.buildSourceChain(ruleset);
    const hasExtensions = ruleset.extensionRulesetIds.length > 0;
    return {
      identities: { entityTypes: kinds.identities, rulesetIds: hasExtensions ? [ruleset.id, ...chain] : [] },
      owned: { entityTypes: kinds.owned },
      namesakes: {
        entityTypes: hasExtensions && chain.length > 1 ? kinds.reprints : [],
        rulesetIds: chain,
      },
      ownNamesakes: { rulesetId: ruleset.id, rulesetIds: hasExtensions ? ruleset.extensionRulesetIds : [] },
      snapshotRulesetIds: chain.length > 0 ? [ruleset.id, ...chain] : [],
    };
  }
}
