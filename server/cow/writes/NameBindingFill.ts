import type { Db } from "@/drizzle/database.ts";
import { Engine, type OwnedKind } from "@/engine/index.ts";
import { type LockedRulesetScope, readWrittenScope, withRulesetScope } from "@/server/cow/views/scope.ts";
import { Entities, EntitySnapshots, Modifiers, NameBindings, Requirements } from "@/server/repositories/index.ts";
import { CUSTOMIZATION_TYPES } from "@/shared/customization/customizationTypes.ts";
import type { NameBindingDraft } from "@/shared/customization/nameBindings.ts";
import type { BaseRules } from "@/shared/enums.ts";
import type { Modifier, NameBinding, Requirement } from "@/shared/relations.ts";

import { findOwnedPairs } from "./ownedPairs.ts";

/**
 * What a fill did: how many rows it gave bindings, how many of those took their source row's, and how many rows'
 * bindings it dropped as stale (a row it binds anew counts in both).
 */
interface FillResult {
  bound: number;
  dropped: number;
  fromSource: number;
}

/** A ruleset's rows that carry paths: its entities' modifiers, and every requirement of them or of those modifiers. */
interface OwnRows {
  modifiers: Modifier[];
  requirements: Requirement[];
}

/** A binding as stored, back to what a save gives: its place and what it names. */
function toDraft({ entityId, entityType, field, kind, name, path, segment }: NameBinding): NameBindingDraft {
  return {
    entityId,
    entityType,
    field: field === "value" ? "value" : "target",
    kind: kind === "group" ? "group" : "entity",
    name,
    path,
    segment,
  };
}

/**
 * The fill of the rows saved before their names were kept: for a ruleset, each of its own modifiers and requirements
 * that has no binding gets what its names mean. A row of an entity the ruleset copied takes what its source row
 * meant (the same row on what it copied: a copy is made word for word, and the ruleset may have renamed since what
 * the words named); any other is read by its text in the ruleset's view. A ruleset's sources are filled before it.
 */
export default class NameBindingFill {
  /**
   * Each row's words, by which a copy's row finds the row it was copied from: a modifier's on its entity, a
   * requirement's on its entity or on its modifier (by that modifier's words), under the entity `entityOf` gives.
   */
  private static signRows({ modifiers, requirements }: OwnRows, entityOf: (id: string) => string | undefined) {
    const signs = new Map<string, string>();
    const signOf = new Map<string, string>();
    for (const m of modifiers) {
      const entity = entityOf(m.sourceId);
      if (entity === undefined) continue;
      signOf.set(m.id, `${entity}|m|${m.target}|${m.operator}|${m.value}`);
      signs.set(m.id, signOf.get(m.id)!);
    }
    for (const r of requirements) {
      const owner = r.entityType === CUSTOMIZATION_TYPES.modifier ? signOf.get(r.entityId) : entityOf(r.entityId);
      if (owner !== undefined) signs.set(r.id, `${owner}|r|${r.level}|${r.target}|${r.operator}|${r.value}`);
    }
    return signs;
  }

  /** One binding per place (field, path, segment): the first. */
  private static uniqueByPlace(bindings: NameBinding[]): NameBinding[] {
    const seen = new Set<string>();
    return bindings.filter((binding) => {
      const place = `${binding.field}|${binding.path}|${binding.segment}`;
      if (seen.has(place)) return false;
      seen.add(place);
      return true;
    });
  }

  /** The rows of the ruleset's entities (`entityIds`), and their bindings' owners. */
  private static async readRows(tx: Db, entityIds: string[]): Promise<OwnRows & { bindings: NameBinding[] }> {
    const modifiers = await Modifiers.findMany(tx, { sourceIds: entityIds });
    const requirements = await Requirements.findMany(tx, {
      entityIds: [...entityIds, ...modifiers.map((modifier) => modifier.id)],
    });
    const bindings = await NameBindings.findMany(tx, {
      modifierIds: modifiers.map((modifier) => modifier.id),
      requirementIds: requirements.map((requirement) => requirement.id),
    });
    return { bindings, modifiers, requirements };
  }

  /**
   * What the source rows of the ruleset's copies meant, by the copy's row: the bindings of the row of the same words
   * on what each copy copied. What a copy owns (a copied class's levels, copied with it) pairs with its source's of
   * its position, as the views pair them, an owner's before what it owns.
   */
  private static async takeFromSources(
    tx: Db,
    { baseRules, id: rulesetId }: { baseRules: BaseRules; id: string },
    own: OwnRows,
  ): Promise<Map<string, NameBindingDraft[]>> {
    const snapshots = await EntitySnapshots.findMany(tx, { rulesetId });
    const taken = new Map<string, NameBindingDraft[]>();
    if (snapshots.length === 0) return taken;
    const sourceOf = new Map(snapshots.map((snapshot) => [snapshot.forkedEntityId, snapshot.sourceEntityId]));
    for (const ownedType of Engine.forRules(baseRules).storage().ownedTypes() as OwnedKind[]) {
      for (const [ownedId, sourceOwnedId] of await findOwnedPairs(tx, ownedType, new Map(sourceOf)))
        if (sourceOwnedId) sourceOf.set(ownedId, sourceOwnedId);
    }
    const sources = await NameBindingFill.readRows(tx, [...sourceOf.values()]);
    const bySign = new Map<string, NameBinding[]>();
    const sourceSigns = NameBindingFill.signRows(sources, (id) => id);
    for (const binding of sources.bindings) {
      const sign = sourceSigns.get((binding.modifierId ?? binding.requirementId)!);
      if (sign !== undefined) bySign.set(sign, [...(bySign.get(sign) ?? []), binding]);
    }
    for (const [rowId, sign] of NameBindingFill.signRows(own, (id) => sourceOf.get(id))) {
      const bindings = bySign.get(sign);
      // Two source rows of the same words mean the same: the first one's bindings, by their place
      if (bindings) taken.set(rowId, NameBindingFill.uniqueByPlace(bindings).map(toDraft));
    }
    return taken;
  }

  /** Fills the ruleset's own rows that have no binding: how many it bound, and how many from their source row. */
  static async fill(tx: Db, rulesetId: string): Promise<FillResult> {
    return await withRulesetScope(tx, rulesetId, async (scope) => {
      const entities = await Entities.findStored(tx, { rulesetId });
      const { bindings, modifiers, requirements } = await NameBindingFill.readRows(
        tx,
        entities.map((entity) => entity.id),
      );
      // A row whose text was changed past its bindings (a fix written straight to the database) is read anew
      const stale = Engine.for(scope).findStaleNameBindings([...modifiers, ...requirements], bindings);
      for (const modifier of modifiers)
        if (stale.has(modifier.id)) await NameBindings.delete(tx, { modifierId: modifier.id });
      for (const requirement of requirements)
        if (stale.has(requirement.id)) await NameBindings.delete(tx, { requirementId: requirement.id });
      const kept = bindings.filter((binding) => !stale.has((binding.modifierId ?? binding.requirementId)!));
      const bound = new Set(kept.map((binding) => binding.modifierId ?? binding.requirementId));
      const own = {
        modifiers: modifiers.filter((modifier) => !bound.has(modifier.id)),
        requirements: requirements.filter((requirement) => !bound.has(requirement.id) && requirement.target !== null),
      };
      const taken = await NameBindingFill.takeFromSources(tx, scope.ruleset, own);
      const read = Engine.for(scope).planNameBindings([...own.modifiers, ...own.requirements]);
      const modifierIds = new Set(own.modifiers.map((modifier) => modifier.id));
      const values = [...read].flatMap(([rowId, drafts]) =>
        (taken.get(rowId) ?? drafts).map((draft) =>
          modifierIds.has(rowId) ? { ...draft, modifierId: rowId } : { ...draft, requirementId: rowId },
        ),
      );
      await NameBindings.createMany(tx, values);
      // Its characters' own modifiers, read in the same view
      const set = await NameBindings.findUnboundOfCharacters(tx, { rulesetId });
      const meant = Engine.for(scope).planNameBindings(set);
      await NameBindings.createMany(
        tx,
        set.flatMap((row) => (meant.get(row.id) ?? []).map((draft) => ({ ...draft, modifierId: row.id }))),
      );
      const rows = new Set(values.map((value) => ("modifierId" in value ? value.modifierId : value.requirementId)));
      return {
        bound: rows.size,
        dropped: stale.size,
        fromSource: [...rows].filter((rowId) => taken.has(rowId)).length,
      };
    });
  }

  /**
   * Gives the rows a write made (`tx`, its transaction, in `scope`, under the ruleset's lock) what their names mean,
   * before it ends: read in the ruleset's view with what the write wrote (`RulesetViews.getWrittenData`), so a row
   * that names an entity the same write made is bound to it. Whatever wrote them, no row leaves a write unbound.
   */
  static async fillWritten(tx: Db, scope: LockedRulesetScope): Promise<void> {
    const rows = await NameBindings.findUnbound(tx, { rulesetId: scope.sources.id });
    // Read first in the view the write started from, which costs nothing: rows that name nothing there name nothing
    const nameable = [...Engine.for(scope).planNameBindings(rows)].flatMap(([id, drafts]) => (drafts.length ? id : []));
    if (nameable.length === 0) return;
    const read = Engine.for(await readWrittenScope(tx, scope)).planNameBindings(rows);
    const values = rows.flatMap((row) =>
      (read.get(row.id) ?? []).map((draft) =>
        row.of === "modifier" ? { ...draft, modifierId: row.id } : { ...draft, requirementId: row.id },
      ),
    );
    await NameBindings.createMany(tx, values);
  }
}
