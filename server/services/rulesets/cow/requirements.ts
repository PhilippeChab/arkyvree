import type { Requirement } from "@/shared/relations.ts";

// ──────────────────────────────────────────────────────────────
// Requirement forest model (used by siblingMerge.ts + the
// matching read-time compose in rulesetCache.ts)
//
// Every entity's requirements form a forest of trees:
//   - Each top-level entry is a root (no `.` parent prefix).
//   - Top-level standalone leaves and chain roots are AND'd at the top level
//     (the implicit AND of the schema).
//   - Chains nest recursively: an OR root contains children which can be
//     leaves OR chain roots themselves (AND-of-ORs, OR-of-ANDs, etc.).
//
// Merging multiple sources (target + N siblings) is `AND(target, sib1, ...)` —
// each source's tree is preserved verbatim and appended at the top level of
// the combined forest. Sibling chain trees get fresh top-level integer roots
// to avoid colliding with target's existing levels; their internal child
// indices are renumbered recursively.
// ──────────────────────────────────────────────────────────────

const MAX_REQ_TREE_DEPTH = 5;

type ReqLeafNode = {
  source: Requirement;
  kind: "leaf";
  target: string;
  operator: string;
  value: string;
  valueType: string;
};
type ReqChainNode = {
  source: Requirement;
  kind: "chain";
  op: string; // "or" | "and"
  children: ReqNode[];
};
export type ReqNode = ReqLeafNode | ReqChainNode;

function parentLevelOf(level: string): string | null {
  const idx = level.lastIndexOf(".");
  return idx === -1 ? null : level.slice(0, idx);
}

/**
 * Build the requirement forest from a flat list of rows for a single entity.
 * Top-level entries (rows with no parent in the set) become forest roots.
 * Chain roots recurse into their direct children. Throws on depth overflow.
 */
export function buildReqForest(rows: Requirement[]): ReqNode[] {
  const byLevel = new Map<string, Requirement>();
  for (const r of rows) byLevel.set(r.level, r);

  const directChildrenOf = (parent: string): Requirement[] => {
    const prefix = `${parent}.`;
    return rows.filter((r) => {
      if (!r.level.startsWith(prefix)) return false;
      // Direct child only — its parent must be `parent`, not a deeper ancestor
      return parentLevelOf(r.level) === parent;
    });
  };

  function buildNode(row: Requirement, depth: number): ReqNode {
    if (depth >= MAX_REQ_TREE_DEPTH) {
      throw new Error(`Requirement tree exceeds max depth (${MAX_REQ_TREE_DEPTH})`);
    }
    if (row.chainingOperator) {
      const children = directChildrenOf(row.level)
        .sort((a, b) => a.level.localeCompare(b.level))
        .map((c) => buildNode(c, depth + 1));
      return { kind: "chain", source: row, op: row.chainingOperator, children };
    }
    return {
      kind: "leaf",
      source: row,
      target: row.target!,
      operator: row.operator!,
      value: row.value!,
      valueType: row.valueType!,
    };
  }

  const topLevelRows = rows.filter((r) => {
    const p = parentLevelOf(r.level);
    return p === null || !byLevel.has(p);
  });

  return topLevelRows
    .sort((a, b) => a.level.localeCompare(b.level))
    .map((r) => buildNode(r, 0));
}

/**
 * Flatten a tree under a given level prefix, preserving source row identity.
 * The copying caller allocates new IDs and records the source-to-copy mapping.
 * Children are renumbered as level.1, level.2, ... regardless of their original
 * indices, so the result is collision-free as long as the caller picks a
 * non-overlapping `level`.
 */
export function serializeReqNode(
  node: ReqNode,
  level: string,
  entityId: string,
  entityType: string,
): Requirement[] {
  const row = { ...node.source, entityId, entityType, level };
  if (node.kind === "leaf") return [row];
  const out: Requirement[] = [row];
  for (let idx = 0; idx < node.children.length; idx++) {
    out.push(...serializeReqNode(node.children[idx], `${level}.${idx + 1}`, entityId, entityType));
  }
  return out;
}

/** Deduplicate standalone roots only; preserve every condition inside a chain. */
export function dedupAgainstExisting(
  node: ReqNode,
  existingKeys: Set<string>,
): ReqNode | null {
  if (node.kind === "leaf") {
    const key = `${node.target}|${node.operator}|${node.value}`;
    if (existingKeys.has(key)) return null;
  }
  // A AND (A OR B) is satisfied whenever A is true. Removing A from the
  // OR would incorrectly require B; keep nested trees intact.
  return node;
}

export function collectAllLeafKeys(forest: ReqNode[]): Set<string> {
  const keys = new Set<string>();
  function walk(node: ReqNode) {
    if (node.kind === "leaf") {
      keys.add(`${node.target}|${node.operator}|${node.value}`);
    } else {
      for (const child of node.children) walk(child);
    }
  }
  for (const node of forest) walk(node);
  return keys;
}

export function collectTopLevelStandaloneKeys(forest: ReqNode[]): Set<string> {
  const keys = new Set<string>();
  for (const node of forest) {
    if (node.kind === "leaf") {
      keys.add(`${node.target}|${node.operator}|${node.value}`);
    }
  }
  return keys;
}

/** Merge sibling forests for both display and copying, retaining source row IDs. */
export function mergeSiblingRequirements(
  targetRequirements: Requirement[],
  siblingRequirements: Iterable<Requirement[]>,
  entityId: string,
  entityType: string,
): Requirement[] {
  const standaloneKeys = collectTopLevelStandaloneKeys(buildReqForest(targetRequirements));
  const usedLevels = new Set(targetRequirements.map(r => r.level));
  let maxTopInt = 0;
  for (const r of targetRequirements) {
    if (/^\d+$/.test(r.level)) maxTopInt = Math.max(maxTopInt, Number(r.level));
  }
  const merged: Requirement[] = [];
  for (const requirements of siblingRequirements) {
    for (const tree of buildReqForest(requirements)) {
      const node = dedupAgainstExisting(tree, standaloneKeys);
      if (!node) continue;
      let level: string;
      if (node.kind === "chain") {
        do { level = String(++maxTopInt); } while (usedLevels.has(level));
      } else {
        const originalLevel = node.source.level;
        level = originalLevel;
        let suffix = 2;
        while (usedLevels.has(level)) level = `${originalLevel}-${suffix++}`;
      }
      for (const row of serializeReqNode(node, level, entityId, entityType)) {
        usedLevels.add(row.level);
        merged.push(row);
      }
      if (node.kind === "leaf") {
        standaloneKeys.add(`${node.target}|${node.operator}|${node.value}`);
      }
    }
  }
  return merged;
}
