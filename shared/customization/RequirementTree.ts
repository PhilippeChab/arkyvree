/**
 * An entity's requirements as a tree. Each row has a level, its place: `"1"`, `"2"` at the top, `"1.2"` under `"1"`,
 * `"1.2.1"` under `"1.2"`. A row with a chaining operator (`and`, `or`) groups the rows under it; a condition row holds
 * none. The top-level rows are AND'd. The server evaluates, prints and merges the tree; the client edits it.
 */

/** A row of the tree, with the rows it groups, in level order. */
export interface RequirementNode<R extends RequirementRow> {
  requirement: R;
  children: RequirementNode<R>[];
}

/** What places a row in the tree: its level, and whether it groups the rows under it. */
export interface RequirementRow {
  level: string;
  chainingOperator: string | null;
}

/** A number, compared as one (`"9"` before `"10"`). */
const NUMERIC = /^\d+$/;

/**
 * Level order: segment by segment, a number as a number (`"1.9"` before `"1.10"`), anything else as text (`"1-2"`, a
 * level the sibling merge renames), a level before the ones under it.
 */
export function compareLevels(a: string, b: string): number {
  const left = a.split(".");
  const right = b.split(".");
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    if (left[i] === right[i]) continue;
    if (NUMERIC.test(left[i]) && NUMERIC.test(right[i])) return Number(left[i]) - Number(right[i]);
    return left[i] < right[i] ? -1 : 1;
  }
  return left.length - right.length;
}

/** The level of the row a level sits under: none at the top. */
export function getParentLevel(level: string): string | null {
  const index = level.lastIndexOf(".");
  return index === -1 ? null : level.slice(0, index);
}

/**
 * The tree of requirement rows. A row whose parent isn't among them is a root. A row under a condition, which groups
 * nothing, is detached: in no node, for the caller to report. An entity's levels are unique (the database holds them
 * so); rows that share one (two entities' rows put together) each keep a node, and a row under that level hangs from
 * the first of them.
 */
export default class RequirementTree<R extends RequirementRow> {
  private constructor(roots: RequirementNode<R>[], detached: R[]) {
    this.roots = roots;
    this.detached = detached;
  }

  static fromRows<R extends RequirementRow>(rows: readonly R[]): RequirementTree<R> {
    const nodes = [...rows]
      .sort((a, b) => compareLevels(a.level, b.level))
      .map((requirement): RequirementNode<R> => ({ requirement, children: [] }));
    // What a row under a level hangs from: the first row at it
    const byLevel = new Map<string, RequirementNode<R>>();
    for (const node of nodes) if (!byLevel.has(node.requirement.level)) byLevel.set(node.requirement.level, node);
    const roots: RequirementNode<R>[] = [];
    const detached: R[] = [];
    for (const node of nodes) {
      const parentLevel = getParentLevel(node.requirement.level);
      const parent = parentLevel === null ? undefined : byLevel.get(parentLevel);
      if (!parent) roots.push(node);
      else if (parent.requirement.chainingOperator) parent.children.push(node);
      else detached.push(node.requirement);
    }
    return new RequirementTree(roots, detached);
  }

  /** The top-level rows, in level order, each with the rows it groups. */
  readonly roots: RequirementNode<R>[];

  /** The rows under a condition, in level order. */
  readonly detached: R[];
}
