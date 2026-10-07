/**
 * How sibling copies' customizations merge into their winner's: one rule per kind, which a ruleset's view composes
 * (`RulesetComposition`) and a copy of the winner writes (`EntityCopy`), the same both ways, so it sits at the lower of
 * the two layers, the cache. Each rule takes the winner's own rows and each sibling's, in the order its `CowData` pairs
 * them (`getSiblings`), and returns the siblings' rows the winner takes, in that order. A modifier, a property or an
 * aptitude link whose key the winner or an earlier sibling has is left out. Requirements merge as trees
 * (`RequirementTree`), whose top-level rows are AND'd: merging the winner with N siblings is `AND(winner, sibling 1, …)`,
 * each sibling's tree kept as it is, appended at the top level. A sibling's group gets a fresh top-level number, its
 * rows renumbered under it; a sibling's top-level condition keeps its level (suffixed `-2`, `-3`… when the winner has
 * it), unless the winner already holds the same condition.
 */

import RequirementTree, { type RequirementNode } from "@/shared/customization/RequirementTree.ts";
import type { Modifier, Property, Requirement } from "@/shared/relations.ts";

type ModifierKey = Pick<Modifier, "target" | "value" | "operator" | "valueType">;

type PropertyKey = Pick<Property, "type" | "value">;

/** A top-level condition's identity: two with the same one are the same condition. */
function conditionKey(requirement: Requirement): string {
  return `${requirement.target}|${requirement.operator}|${requirement.value}`;
}

/**
 * A tree's rows under a given level, on the winner, keeping each row's identity: the copying caller allocates new IDs
 * and records the source-to-copy mapping. Children are renumbered `level.1`, `level.2`… whatever their original
 * numbers, so the result is collision-free as long as the caller picks a level nothing else holds.
 */
function serializeNode(node: RequirementNode<Requirement>, level: string, entityId: string): Requirement[] {
  const rows: Requirement[] = [{ ...node.requirement, entityId, level }];
  for (const [index, child] of node.children.entries())
    rows.push(...serializeNode(child, `${level}.${index + 1}`, entityId));

  return rows;
}

/** The siblings' rows whose key neither the winner's rows nor an earlier sibling's row has, in the siblings' order. */
function takeNewRows<T>(own: readonly T[], siblings: Iterable<readonly T[]>, keyOf: (row: T) => string): T[] {
  const keys = new Set(own.map(keyOf));
  const taken: T[] = [];
  for (const rows of siblings) {
    for (const row of rows) {
      const key = keyOf(row);
      if (keys.has(key)) continue;
      keys.add(key);
      taken.push(row);
    }
  }
  return taken;
}

/**
 * The siblings' links to aptitudes the winner doesn't link to: an aptitude is the one `resolve` gives (a stale id's
 * copy or winner). The first link to an aptitude wins, a power's with its level.
 */
export function mergeSiblingAptitudeLinks<T extends { aptitudeId: string }>(
  own: readonly T[],
  siblings: Iterable<readonly T[]>,
  resolve: (id: string) => string,
): T[] {
  return takeNewRows(own, siblings, (link) => resolve(link.aptitudeId));
}

/**
 * The siblings' modifiers the winner doesn't have, by target, value, operator and value type: each comes with its
 * requirements, and a modifier left out leaves its requirements out.
 */
export function mergeSiblingModifiers<T extends ModifierKey>(own: readonly T[], siblings: Iterable<readonly T[]>): T[] {
  return takeNewRows(own, siblings, (m) => `${m.target}|${m.value}|${m.operator}|${m.valueType}`);
}

/** The siblings' properties the winner doesn't have, by type and value. */
export function mergeSiblingProperties<T extends PropertyKey>(
  own: readonly T[],
  siblings: Iterable<readonly T[]>,
): T[] {
  return takeNewRows(own, siblings, (p) => `${p.type}|${p.value}`);
}

/** The siblings' requirements, merged into the winner's trees: the rows on the winner (`entityId`), source ids kept. */
export function mergeSiblingRequirements(
  own: readonly Requirement[],
  siblings: Iterable<readonly Requirement[]>,
  entityId: string,
): Requirement[] {
  // Only the winner's top-level conditions deduplicate: A AND (A OR B) is met whenever A is, but removing A from the
  // OR would wrongly require B, so a group's conditions stay
  const standaloneKeys = new Set(
    RequirementTree.fromRows(own)
      .roots.filter((node) => !node.requirement.chainingOperator)
      .map((node) => conditionKey(node.requirement)),
  );
  const usedLevels = new Set(own.map((r) => r.level));
  let maxTopInt = 0;
  for (const r of own) if (/^\d+$/.test(r.level)) maxTopInt = Math.max(maxTopInt, Number(r.level));

  const merged: Requirement[] = [];
  for (const requirements of siblings) {
    for (const node of RequirementTree.fromRows(requirements).roots) {
      const isGroup = !!node.requirement.chainingOperator;
      if (!isGroup && standaloneKeys.has(conditionKey(node.requirement))) continue;
      let level: string;
      if (isGroup) {
        do level = String(++maxTopInt);
        while (usedLevels.has(level));
      } else {
        const originalLevel = node.requirement.level;
        level = originalLevel;
        let suffix = 2;
        while (usedLevels.has(level)) level = `${originalLevel}-${suffix++}`;
      }
      for (const row of serializeNode(node, level, entityId)) {
        usedLevels.add(row.level);
        merged.push(row);
      }
      if (!isGroup) standaloneKeys.add(conditionKey(node.requirement));
    }
  }
  return merged;
}
