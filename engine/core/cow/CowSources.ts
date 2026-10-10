/**
 * The rows a ruleset's `CowData` is built from (`CowDataBuilder.build`), as stored, which the server reads as
 * `CowSources.getReads` says: its snapshots, and its source chain's, the levels of the classes it copied, the chain's
 * native namesakes of the types that pair by name, and the chain's aptitudes.
 */
export interface CowRows {
  aptitudes: { id: string; name: string; rulesetId: string }[];
  klassLevels: { id: string; klassId: string; level: number }[];
  namesakes: { entityType: string; id: string; name: string; rulesetId: string }[];
  snapshots: { entityType: string; forkedEntityId: string; rulesetId: string; sourceEntityId: string }[];
}

/** A ruleset's id and where its inherited entities come from. */
export interface RulesetSources {
  ancestorRulesetIds: string[];
  extensionRulesetIds: string[];
  id: string;
}

/**
 * Tables that participate in the name-based sibling fallback. Limited to feats and powers because those are the entity
 * types sourcebooks commonly reprint (a spell in two books). For other entity types (races, classes, abilities,
 * saves, skills, items, languages, mechanics) a same-name match across extensions is more likely a genuine collision
 * than a reprint — auto-merging a race or a class of one name between two homebrew packages would silently corrupt
 * content. Aptitudes are also excluded; they have their own name-grouping pass since name = identity universally for
 * them.
 *
 * `NAME_FALLBACK_ENTITY_TYPES` is the canonical list: `ExtensionNames` reads it too, so the runtime pairing and the
 * subscribe-time block agree on which types pair.
 */
export const NAME_FALLBACK_ENTITY_TYPES = ["feats", "powers"] as const;

/** Where a ruleset's copy-on-write data comes from: its source chain, and the rows it's built from. */
export default class CowSources {
  /**
   * Build the combined source chain for COW lookups:
   * extensions first (their new entities are visible), then ancestors.
   */
  static buildSourceChain(ruleset: { ancestorRulesetIds: string[]; extensionRulesetIds: string[] }): string[] {
    return [...ruleset.extensionRulesetIds, ...ruleset.ancestorRulesetIds];
  }

  /** The ruleset's own class snapshots: the classes it copied, whose levels pair by number. */
  static getKlassSnapshots(rulesetId: string, snapshots: CowRows["snapshots"]) {
    return snapshots.filter((snap) => snap.rulesetId === rulesetId && snap.entityType === "klasses");
  }

  /** The classes whose levels pair by number: those the ruleset copied (its snapshots say), and their sources. */
  static getPairedKlassIds(rulesetId: string, snapshots: CowRows["snapshots"]) {
    return CowSources.getKlassSnapshots(rulesetId, snapshots).flatMap((snap) => [
      snap.sourceEntityId,
      snap.forkedEntityId,
    ]);
  }

  /**
   * What a ruleset's `CowData` is read from, each read none when it needs none: its snapshots and its chain's, when it
   * has a chain (a ruleset with none copies nothing); its chain's aptitudes, which pair by name when it has extensions;
   * and its chain's native namesakes of the types that pair by name, when its extensions and ancestors make more than one
   * source. The levels of the classes it copied follow from its snapshots (`getPairedKlassIds`).
   */
  static getReads(ruleset: RulesetSources) {
    const chain = CowSources.buildSourceChain(ruleset);
    const hasExtensions = ruleset.extensionRulesetIds.length > 0;
    return {
      aptitudeRulesetIds: hasExtensions ? chain : [],
      namesakes: {
        entityTypes: hasExtensions && chain.length > 1 ? [...NAME_FALLBACK_ENTITY_TYPES] : [],
        rulesetIds: chain,
      },
      snapshotRulesetIds: chain.length > 0 ? [ruleset.id, ...chain] : [],
    };
  }
}
