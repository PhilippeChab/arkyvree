import type { Db } from "@/drizzle/database.ts";
import { type RulesetData } from "@/engine/core/view/index.ts";
import type { KlassLevel, KlassLevelFeat, KlassLevelSpell } from "@/engine/rulesets/dnd3.5/index.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { EntityEdit, RulesetViews } from "@/server/cow/index.ts";
import { withTransaction } from "@/server/database/index.ts";
import { Entities, Joins, type RulesetEntityType } from "@/server/repositories/index.ts";

type Fork = Parameters<typeof RulesetViews.getData>[0];

/** The entity type of a feat, a spell or an item of the view. */
function typeOf(data: RulesetData, id: string): RulesetEntityType | undefined {
  return (["feats", "spells", "aptitudes", "items"] as const).find((type) => data.byId(type).has(id));
}

/**
 * The aptitudes a copy's links store that its ruleset's view resolves to another (a losing copy of a list), read by
 * their stored ids: a feat's or a spell's lists, a class's levels' granted feats' and spells'. None, for a right copy.
 */
async function findStaleAptitudeIds(tx: Db, view: RulesetData, type: RulesetEntityType, copyId: string) {
  const links = await readAptitudeLinks(tx, type, copyId);
  return links.map((link) => link.aptitudeId).filter((id) => view.canonicalize(id) !== id);
}

/** A copy's links to lists as stored: a feat's or a spell's lists, a class's levels' granted feats' and spells'. */
async function readAptitudeLinks(tx: Db, type: RulesetEntityType, copyId: string) {
  if (type === "feats" || type === "spells") {
    return await Joins.findMany<{ aptitudeId: string }>(tx, {
      join: type === "feats" ? "feats_aptitudes" : "spells_aptitudes",
      fromIds: [copyId],
    });
  }
  if (type !== "classes") return [];
  const klassLevelIds = (
    await Entities.findMany<KlassLevel>(tx, { entityType: "class_levels", ownerIds: [copyId] })
  ).map((level) => level.id);
  return [
    ...(await Joins.findMany<KlassLevelFeat>(tx, { join: "class_level_feats", fromIds: klassLevelIds })),
    ...(await Joins.findMany<KlassLevelSpell>(tx, { join: "class_level_spells", fromIds: klassLevelIds })),
  ];
}

/**
 * A winner's copy, or a class's, into the fork, in a transaction rolled back: `check` reads what was stored, by the
 * copy's id, with the fork's view after the copy.
 */
async function withCopy(
  fork: Fork,
  type: RulesetEntityType,
  id: string,
  check: (tx: Db, after: RulesetData, copyId: string) => Promise<void>,
) {
  await withTransaction(async (tx) => {
    const { id: copyId } = await new EntityEdit(fork).cowToEdit(tx, type, { id, rulesetId: "inherited" });
    RulesetViews.invalidate(fork.id);
    await check(tx, await RulesetViews.getData(fork), copyId);
    throw new Rollback();
  }).catch((error) => {
    if (!(error instanceof Rollback)) throw error;
  });
  RulesetViews.invalidate(fork.id);
}

class Rollback extends Error {}

/** A winner's merged customizations, as the view shows them: their content, not their ids. */
export function customizationsOf(data: RulesetData, id: string) {
  const requirementsOf = (entityId: string) =>
    (data.requirementsByEntity.get(entityId) ?? [])
      .map((r) => [r.level, r.chainingOperator, r.target, r.operator, r.value, r.valueType].join("|"))
      .sort();
  return {
    modifiers: (data.modifiersBySource.get(id) ?? [])
      .map((m) => [m.target, m.operator, m.value, m.valueType, ...requirementsOf(m.id)].join("|"))
      .sort(),
    requirements: requirementsOf(id),
    values: valuesOf(data, id),
    links: [
      ...(Dnd35View.of(data)
        .featsById.get(id)
        ?.featsAptitudesInRules.map((l) => l.aptitudeId) ?? []),
      ...(Dnd35View.of(data)
        .spellsById.get(id)
        ?.spellsAptitudesInRules.map((l) => `${l.aptitudeId}|${l.level}`) ?? []),
    ].sort(),
  };
}

/**
 * The sweeps' part `part` of `parts` (from 1): every `parts`-th id, so the parts, each a file of its own that a shard or
 * a worker runs alongside the others, cover every id once.
 */
export function partOf(ids: string[], part: number, parts: number) {
  return ids.filter((_, index) => index % parts === part - 1);
}

/** An entity's stored values, as the view shows them: each field's value and each link, `<field or role>|<value>`. */
export function valuesOf(data: RulesetData, id: string) {
  const { fields, links } = data.valuesOf(id);
  return [
    ...Object.entries(fields).flatMap(([field, values]) => values.map((value) => `${field}|${String(value)}`)),
    ...Object.entries(links).map(([role, toId]) => `${role}|${toId}`),
  ].sort();
}

/**
 * Copies each winner into the ruleset, in a transaction rolled back, and compares the copy's customizations in the view
 * with the winner's before it was copied: the winners compared, and the mismatches, by winner and kind.
 */
export async function compareCopies(fork: Fork, winnerIds: string[]) {
  const before = await RulesetViews.getData(fork);
  const mismatches: string[] = [];
  let compared = 0;
  for (const winnerId of winnerIds) {
    const type = typeOf(before, winnerId);
    if (!type) continue;
    compared++;
    const expected = customizationsOf(before, winnerId);
    await withCopy(fork, type, winnerId, async (tx, after, copyId) => {
      const actual = customizationsOf(after, copyId);
      for (const kind of ["modifiers", "values", "requirements", "links"] as const) {
        if (JSON.stringify(actual[kind]) === JSON.stringify(expected[kind])) continue;
        mismatches.push(`${type} ${winnerId} ${kind}: view ${expected[kind]} copy ${actual[kind]}`);
      }
      const stale = await findStaleAptitudeIds(tx, after, type, copyId);
      if (stale.length > 0) mismatches.push(`${type} ${winnerId} stores links to losing lists: ${stale}`);
    });
  }
  return { compared, mismatches };
}

/** The classes of the fork's view, sorted: what a copy of each stores, the sweeps check (`findStaleClassCopies`). */
export async function findKlassIds(fork: Fork) {
  const view = await RulesetViews.getData(fork);
  return [...new Set(view.rows("classes").map((klass) => klass.id))].sort();
}

/** The sibling winners of the fork's view, sorted: what a copy of each must hold as the view showed it. */
export async function findSiblingWinnerIds(fork: Fork) {
  const { cow } = await RulesetViews.getData(fork);
  return [...new Set([...cow.siblingIds].flatMap((loserId) => cow.getWinner(loserId) ?? []))].sort();
}

/**
 * Copies each class into the ruleset, in a transaction rolled back: the classes whose copy's levels store a list a
 * losing copy stands for, by name, with those lists.
 */
export async function findStaleClassCopies(fork: Fork, klassIds: string[]) {
  const view = await RulesetViews.getData(fork);
  const stale: string[] = [];
  for (const klassId of klassIds) {
    await withCopy(fork, "classes", klassId, async (tx, after, copyId) => {
      const ids = await findStaleAptitudeIds(tx, after, "classes", copyId);
      if (ids.length > 0) stale.push(`${view.find("classes", klassId)?.name}: ${ids}`);
    });
  }
  return stale;
}
