/**
 * The merge of sibling copies' requirements into their winner's, which a ruleset's view composes
 * (`RulesetComposition`) and a copy of the winner writes (`EntityCopy`): the same merge both ways, so it sits at the
 * lower of the two layers, the cache. Each entity's requirements form a tree (`RequirementTree`), whose top-level rows
 * are AND'd. Merging the target with N siblings is `AND(target, sibling 1, …)`: each sibling's tree is kept as it is,
 * appended at the top level. A sibling's group gets a fresh top-level number, its rows renumbered under it; a
 * sibling's top-level condition keeps its level (suffixed `-2`, `-3`… when the target has it), unless the target
 * already holds the same condition.
 */

import RequirementTree, { type RequirementNode } from "@/shared/customization/requirementTree.ts";
import type { Requirement } from "@/shared/relations.ts";

/** A top-level condition's identity: two with the same one are the same condition. */
function conditionKey(requirement: Requirement): string {
  return `${requirement.target}|${requirement.operator}|${requirement.value}`;
}

/**
 * A tree's rows under a given level, keeping each row's identity: the copying caller allocates new IDs and records the
 * source-to-copy mapping. Children are renumbered `level.1`, `level.2`… whatever their original numbers, so the result
 * is collision-free as long as the caller picks a level nothing else holds.
 */
function serializeNode(
  node: RequirementNode<Requirement>,
  level: string,
  entityId: string,
  entityType: string,
): Requirement[] {
  const rows: Requirement[] = [{ ...node.requirement, entityId, entityType, level }];
  for (const [index, child] of node.children.entries()) {
    rows.push(...serializeNode(child, `${level}.${index + 1}`, entityId, entityType));
  }
  return rows;
}

/** Merge sibling trees for both display and copying, retaining source row IDs. */
export function mergeSiblingRequirements(
  targetRequirements: Requirement[],
  siblingRequirements: Iterable<Requirement[]>,
  entityId: string,
  entityType: string,
): Requirement[] {
  // Only the target's top-level conditions deduplicate: A AND (A OR B) is met whenever A is, but removing A from the
  // OR would wrongly require B, so a group's conditions stay
  const standaloneKeys = new Set(
    RequirementTree.fromRows(targetRequirements)
      .roots.filter((node) => !node.requirement.chainingOperator)
      .map((node) => conditionKey(node.requirement)),
  );
  const usedLevels = new Set(targetRequirements.map((r) => r.level));
  let maxTopInt = 0;
  for (const r of targetRequirements) {
    if (/^\d+$/.test(r.level)) maxTopInt = Math.max(maxTopInt, Number(r.level));
  }
  const merged: Requirement[] = [];
  for (const requirements of siblingRequirements) {
    for (const node of RequirementTree.fromRows(requirements).roots) {
      const isGroup = !!node.requirement.chainingOperator;
      if (!isGroup && standaloneKeys.has(conditionKey(node.requirement))) continue;
      let level: string;
      if (isGroup) {
        do {
          level = String(++maxTopInt);
        } while (usedLevels.has(level));
      } else {
        const originalLevel = node.requirement.level;
        level = originalLevel;
        let suffix = 2;
        while (usedLevels.has(level)) level = `${originalLevel}-${suffix++}`;
      }
      for (const row of serializeNode(node, level, entityId, entityType)) {
        usedLevels.add(row.level);
        merged.push(row);
      }
      if (!isGroup) standaloneKeys.add(conditionKey(node.requirement));
    }
  }
  return merged;
}
