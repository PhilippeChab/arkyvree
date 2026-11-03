/**
 * How sibling copies' customizations merge into their winner's: one rule per kind, which a ruleset's view composes
 * (`RulesetComposition`) and a copy of the winner writes (`EntityCopy`), the same both ways: the engine's, which both
 * ask. Each rule takes the winner's own rows and each sibling's, in the order its `CowData` pairs them (`getSiblings`),
 * and returns the siblings' rows the winner takes, in that order. A modifier, a value of a set or a link of a role that
 * merges (`mergeLinks`: a 3.5 feat's pool) whose key the winner or an earlier sibling has is left out. An entity's
 * fields and single links merge field by field and role by role (`mergeValues`), each by its declaration: a set's
 * values the winner lacks (`union`), a single value the first copy's that changed it from what it copied (a field's,
 * its default among them, which no row holds), else the winner's, else the first sibling's that holds one
 * (`fallback`), or the winner's alone (`winner`). Requirements merge as trees (`RequirementTree`), whose top-level
 * rows are AND'd: merging the winner with N siblings is `AND(winner, sibling 1, …)`, each sibling's tree kept as it is, appended at the top level. A
 * sibling's top-level row (one whose parent level none of its rows holds, a row under a missing one too), a condition
 * or a group, keeps its level while no level held so far (the winner's, the rows placed before it) shares its first
 * segment, else takes a fresh top-level number past every one held; a group's rows are renumbered under it. So a row
 * never meets another, and no tree changes its meaning: none is adopted by a group, nor left under a condition. A
 * sibling's top-level condition the winner already holds is left out.
 */

import { type DeclaredFields, OwnerValues, type StoredValues } from "@/engine/core/fields/index.ts";
import type { FieldValue, OwnerFields } from "@/engine/core/module/index.ts";
import RequirementTree, { getNextLevel, type RequirementNode } from "@/shared/customization/RequirementTree.ts";
import type { Modifier, Requirement } from "@/shared/relations.ts";

type ModifierKey = Pick<Modifier, "target" | "value" | "operator" | "valueType">;

/**
 * What the copies a merge reads copied, as their snapshots record it (`CowData.sourceOf`): the winner's (`own`) and
 * each sibling's, in their order; none for one that copies none (a book's reprint of another's).
 */
export interface CopiedSources {
  own?: StoredValues;
  siblings: readonly (StoredValues | undefined)[];
}

/** An entity's customizations: its modifiers, with their requirements apart, and its requirements. */
export interface EntityCustomizations {
  modifierRequirements: Requirement[];
  modifiers: Modifier[];
  requirements: Requirement[];
}

/** The merge of sibling copies' customizations and links into their winner's, one rule per kind. */
export default class SiblingMerge {
  /** A top-level condition's identity: two with the same one are the same condition. */
  private static conditionKey(requirement: Requirement): string {
    return `${requirement.target}|${requirement.operator}|${requirement.value}`;
  }

  /** The fields any of `values` holds (none, one that copies none), each once. */
  private static fieldsOf(values: readonly (StoredValues | undefined)[]): Set<string> {
    return new Set(values.flatMap((held) => (held ? Object.keys(held.fields) : [])));
  }

  /**
   * The level a sibling's top-level row (`level`) takes beside the levels held (`usedLevels`): its own while none of
   * them shares its first segment, else the next top-level one past them all. Under a level held, a group would adopt
   * it; over one, it would take the rows under that level from their tree.
   */
  private static placeRoot(level: string, usedLevels: ReadonlySet<string>): string {
    const segment = level.split(".")[0];
    const held = [...usedLevels];
    return held.some((used) => used.split(".")[0] === segment) ? getNextLevel(held, null) : level;
  }

  /** Whether two sets of values hold the same values, whatever their order. */
  private static sameValues(a: readonly FieldValue[], b: readonly FieldValue[]): boolean {
    const sorted = (values: readonly FieldValue[]) => values.map(String).toSorted();
    return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
  }

  /**
   * A tree's rows under a given level, on the winner, keeping each row's identity: the copying caller allocates new IDs
   * and records the source-to-copy mapping. Children are renumbered `level.1`, `level.2`… whatever their original
   * numbers, so the result is collision-free as long as the caller picks a level nothing else holds, at it or under it.
   */
  private static serializeNode(node: RequirementNode<Requirement>, level: string, entityId: string): Requirement[] {
    const rows: Requirement[] = [{ ...node.requirement, entityId, level }];
    for (const [index, child] of node.children.entries())
      rows.push(...SiblingMerge.serializeNode(child, `${level}.${index + 1}`, entityId));

    return rows;
  }

  /**
   * A single value's (`field`) merge: the first copy, the winner (`own`, `by` 0) then its siblings (`by` 1…), whose
   * values differ from those of what it copied (`sources`), none among them (a false flag, a default number: what a
   * write stores no row of); for one that copies none (a reprint), its values when it holds one. Else the first
   * sibling's that holds one, past a winner that holds none. Its values as it holds them, none when it set the field
   * back to its default. None when the winner keeps its own.
   */
  private static setValue(
    own: StoredValues,
    siblings: readonly StoredValues[],
    sources: CopiedSources,
    field: string,
  ): { by: number; values: OwnerFields[string] | undefined } | undefined {
    const copies = [own, ...siblings];
    const setter = copies.findIndex((copy, index) => {
      const values = OwnerValues.valuesOf(copy.fields, field);
      const source = index === 0 ? sources.own : sources.siblings[index - 1];
      return source ? !SiblingMerge.sameValues(values, OwnerValues.valuesOf(source.fields, field)) : values.length > 0;
    });
    if (setter >= 0) return { by: setter, values: copies[setter].fields[field] };
    if (field in own.fields) return undefined;
    const holder = siblings.findIndex((sibling) => field in sibling.fields);
    return holder < 0 ? undefined : { by: holder + 1, values: siblings[holder].fields[field] };
  }

  /** The siblings' rows whose key neither the winner's rows nor an earlier sibling's row has, in the siblings' order. */
  private static takeNewRows<T>(own: readonly T[], siblings: Iterable<readonly T[]>, keyOf: (row: T) => string): T[] {
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
   * What a copy of a sibling winner takes of its siblings' customizations (`siblings`, in the order its `CowData` pairs
   * them) beside its own (`own`, which the copy holds): their modifiers, each with its requirements, and their
   * requirements, merged as the view merges them, a requirement onto the copy (`targetEntityId`).
   */
  static mergeCustomizations(
    own: EntityCustomizations,
    siblings: EntityCustomizations[],
    targetEntityId: string,
  ): EntityCustomizations {
    const modifiers = SiblingMerge.mergeModifiers(
      own.modifiers,
      siblings.map((customizations) => customizations.modifiers),
    );
    const modifierIds = new Set(modifiers.map((modifier) => modifier.id));
    return {
      modifiers,
      modifierRequirements: siblings
        .flatMap((customizations) => customizations.modifierRequirements)
        .filter((requirement) => modifierIds.has(requirement.entityId)),
      requirements: SiblingMerge.mergeRequirements(
        own.requirements,
        siblings.map((customizations) => customizations.requirements),
        targetEntityId,
      ),
    };
  }

  /**
   * The siblings' links, of the roles that merge, to targets the winner doesn't link to by their role: a target is the
   * one `resolve` gives (a stale id's copy or winner). The first link to a target wins, with its tier.
   */
  static mergeLinks<T extends { role: string; toId: string; toType: string }>(
    own: readonly T[],
    siblings: Iterable<readonly T[]>,
    resolve: (id: string) => string,
  ): T[] {
    return SiblingMerge.takeNewRows(own, siblings, (link) => `${link.role} ${link.toType} ${resolve(link.toId)}`);
  }

  /**
   * The siblings' modifiers the winner doesn't have, by target, value, operator and value type: each comes with its
   * requirements, and a modifier left out leaves its requirements out.
   */
  static mergeModifiers<T extends ModifierKey>(own: readonly T[], siblings: Iterable<readonly T[]>): T[] {
    return SiblingMerge.takeNewRows(own, siblings, (m) => `${m.target}|${m.value}|${m.operator}|${m.valueType}`);
  }

  /** The siblings' requirements, merged into the winner's trees: the rows on the winner (`entityId`), source ids kept. */
  static mergeRequirements(
    own: readonly Requirement[],
    siblings: Iterable<readonly Requirement[]>,
    entityId: string,
  ): Requirement[] {
    // Only the winner's top-level conditions deduplicate: A AND (A OR B) is met whenever A is, but removing A from the
    // OR would wrongly require B, so a group's conditions stay
    const standaloneKeys = new Set(
      RequirementTree.fromRows(own)
        .roots.filter((node) => !node.requirement.chainingOperator)
        .map((node) => SiblingMerge.conditionKey(node.requirement)),
    );
    const usedLevels = new Set(own.map((r) => r.level));

    const merged: Requirement[] = [];
    for (const requirements of siblings) {
      for (const node of RequirementTree.fromRows(requirements).roots) {
        const isGroup = !!node.requirement.chainingOperator;
        if (!isGroup && standaloneKeys.has(SiblingMerge.conditionKey(node.requirement))) continue;
        const level = SiblingMerge.placeRoot(node.requirement.level, usedLevels);
        for (const row of SiblingMerge.serializeNode(node, level, entityId)) {
          usedLevels.add(row.level);
          merged.push(row);
        }
        if (!isGroup) standaloneKeys.add(SiblingMerge.conditionKey(node.requirement));
      }
    }
    return merged;
  }

  /**
   * An entity's fields and single links (`own`, of `ownerType`) with its siblings' merged in (`siblings`, in the order
   * its `CowData` pairs them), each field and link by its declared merge (`declared`): a set's (`union`) values it
   * lacks, by value, in its declared order; a single value's (`fallback`) the first copy's that changed it from what it
   * copied (`sources`: its own first, a value set back to its default, which no row holds, among them: `setValue`),
   * else its own, else the first sibling's that holds it; one the winner's alone holds (`winner`) its own. Its fields
   * in their declared order, and what each sibling gave (`taken`, in their order).
   */
  static mergeValues(
    own: StoredValues,
    siblings: readonly StoredValues[],
    ownerType: string,
    declared: DeclaredFields,
    sources: CopiedSources = { siblings: [] },
  ): { taken: StoredValues[]; values: StoredValues } {
    const fields: Record<string, OwnerFields[string]> = { ...own.fields };
    const links: Partial<Record<string, string>> = { ...own.links };
    const taken = siblings.map(() => ({
      fields: {} as Record<string, OwnerFields[string]>,
      links: {} as Record<string, string>,
    }));
    for (const field of SiblingMerge.fieldsOf([own, ...siblings, sources.own, ...sources.siblings])) {
      if (declared.mergeOf(ownerType, field) !== "fallback") continue;
      const set = SiblingMerge.setValue(own, siblings, sources, field);
      if (set === undefined || set.by === 0) continue;
      if (set.values === undefined) delete fields[field];
      else fields[field] = taken[set.by - 1].fields[field] = set.values;
    }
    for (const [index, sibling] of siblings.entries()) {
      const given = taken[index];
      for (const field of Object.keys(sibling.fields)) {
        if (declared.mergeOf(ownerType, field) !== "union") continue;
        const kept = OwnerValues.valuesOf(fields, field);
        const held = new Set(kept.map(String));
        const added: FieldValue[] = OwnerValues.valuesOf(sibling.fields, field).filter(
          (value) => !held.has(String(value)),
        );
        if (added.length === 0) continue;
        given.fields[field] = added;
        fields[field] = declared.orderValues(field, [...kept, ...added]);
      }
      for (const [role, toId] of Object.entries(sibling.links)) {
        if (toId === undefined || declared.roleMergeOf(ownerType, role) !== "fallback" || role in links) continue;
        links[role] = given.links[role] = toId;
      }
    }
    const ordered = Object.keys(fields).toSorted((a, b) => declared.compareFields(a, b));
    return { taken, values: { fields: Object.fromEntries(ordered.map((field) => [field, fields[field]])), links } };
  }
}
