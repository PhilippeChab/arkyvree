/**
 * What a fork keeps of a book it unsubscribes from, repaired before the book's content leaves it (`unsubscribeExtension`).
 * What leaves (`findDepartures`) is the book's entities, the fork's copies of them, and their classes' levels, each with
 * what the fork's view shows in its place once the book is gone, when anything does: the entity a book's copy stands for
 * (a core feat it overrides), or another book's copy of it, which wins once this one is gone; a reprint's namesake; the
 * list of the same name another book has, a list's name being its identity (`CowDataBuilder` pairs namesakes); a class's
 * level the level of its number in the class its class falls back to. What the fork and its characters keep that names
 * one names what stands in its place instead (`repointDepartingReferences`). What names one with nothing in its place
 * refuses the unsubscribe: a character's pick (its in-use check), or one of the fork's rows (a link to a list no other
 * book has, an item's template, a class's skill or granted feat…).
 */

import type { Db } from "@/drizzle/database.ts";
import type { RulesetSources } from "@/engine/index.ts";
import { CowDataReader } from "@/server/cow/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import {
  EntityReferences,
  KlassLevels,
  type ReferencedType,
  RULESET_ENTITY_TYPES,
  RulesetEntities,
  type RulesetEntityType,
} from "@/server/repositories/index.ts";

/** The fork's copies of the book's entities, by entity type: what the unsubscribe reverts, their own rows with them. */
export type Copies = ReadonlyMap<string, string[]>;

/**
 * What leaves the fork with the book, by entity type (`findDepartures`): each id, with the id the fork's view shows in
 * its place once the book is gone, or `undefined` when nothing stands there.
 */
export type Departures = ReadonlyMap<ReferencedType, ReadonlyMap<string, string | undefined>>;

/** How many lost references the refusal names. */
const NAMED_LOSSES = 10;

/**
 * The departing classes' levels, each with the level of its number in the class that stands in its class's place, as
 * the views pair a copy's levels (`CowDataBuilder`) and a restore moves a character's (`EntityRevert`): none when that
 * class has no such level, or when nothing stands in its class's place.
 */
async function findLevelFallbacks(tx: Db, klasses: ReadonlyMap<string, string | undefined>) {
  const fallbackIds = [...klasses.values()].filter((id) => id !== undefined);
  const levels = await KlassLevels.findMany(tx, { klassIds: [...klasses.keys(), ...fallbackIds] });
  const levelsOf = Map.groupBy(levels, (level) => level.klassId);
  const fallbacks = new Map<string, string | undefined>();
  for (const [klassId, fallbackId] of klasses) {
    const theirs = new Map(
      (fallbackId ? (levelsOf.get(fallbackId) ?? []) : []).map((level) => [level.level, level.id]),
    );
    for (const level of levelsOf.get(klassId) ?? []) fallbacks.set(level.id, theirs.get(level.level));
  }
  return fallbacks;
}

/**
 * The fork's rows naming what leaves with nothing in its place (`EntityReferences.findMany`), as the refusal names
 * them: a link to a list no other book has, or a row naming another of the book's entities (an item's template, a
 * class's skill or granted feat…). The copies' own rows, which go with them, are left out.
 */
async function findLostReferences(tx: Db, rulesetId: string, departures: Departures, copies: Copies) {
  const typeOf = new Map<string, RulesetEntityType>();
  for (const type of RULESET_ENTITY_TYPES)
    for (const [id, fallbackId] of departures.get(type) ?? []) if (!fallbackId) typeOf.set(id, type);
  const deleted = new Set([...copies.values()].flat());
  const references = (await EntityReferences.findMany(tx, { rulesetId, entityIds: [...typeOf.keys()] })).filter(
    (reference) => !deleted.has(reference.id),
  );
  const names = new Map<string, string>();
  for (const [type, lost] of Map.groupBy(references, (reference) => typeOf.get(reference.targetId)!)) {
    const ids = lost.map((reference) => reference.targetId);
    for (const entity of await RulesetEntities.findNames(tx, type, { ids })) names.set(entity.id, entity.name);
  }
  return references.map((reference) =>
    typeOf.get(reference.targetId) === "aptitudes"
      ? `${names.get(reference.targetId)}, a list no other book of this ruleset has`
      : `${reference.name}, which uses ${names.get(reference.targetId)}`,
  );
}

/**
 * What leaves `ruleset` with the book (`extensionId`), by entity type: the book's entities and the fork's copies of them
 * (`copies`), and their classes' levels, each with what the fork's view shows in its place once the book is gone. That
 * is the first of the ids the view now shows it for (`CowData.getEquivalentIds`: the entity a copy stands for, the other
 * books' copies of it and the namesakes paired with it) that stays, as the view without the book resolves it, when that
 * view shows it: a copy the fork deleted shows nothing.
 */
export async function findDepartures(
  tx: Db,
  ruleset: RulesetSources,
  extensionId: string,
  copies: Copies,
): Promise<Departures> {
  const remaining = { ...ruleset, extensionRulesetIds: ruleset.extensionRulesetIds.filter((id) => id !== extensionId) };
  const before = await CowDataReader.read(tx, ruleset);
  const after = await CowDataReader.read(tx, remaining);
  const leaving = new Map<RulesetEntityType, string[]>();
  for (const type of RULESET_ENTITY_TYPES) {
    const own = await RulesetEntities.findNames(tx, type, { rulesetId: extensionId });
    leaving.set(type, [...own.map((entity) => entity.id), ...(copies.get(type) ?? [])]);
  }
  const left = new Set([...leaving.values()].flat());

  const departures = new Map<ReferencedType, ReadonlyMap<string, string | undefined>>();
  for (const [type, ids] of leaving) {
    const candidates = new Map(
      ids.map((id) => [
        id,
        before
          .getEquivalentIds(id)
          .filter((other) => !left.has(other))
          .map((other) => after.resolve(other))
          .filter((other) => !after.isHidden(other)),
      ]),
    );
    const shown = [...new Set([...candidates.values()].flat())];
    const live = new Set((await RulesetEntities.findNames(tx, type, { ids: shown })).map((entity) => entity.id));
    departures.set(type, new Map(ids.map((id) => [id, candidates.get(id)!.find((other) => live.has(other))])));
  }
  departures.set("klass_levels", await findLevelFallbacks(tx, departures.get("klasses")!));
  return departures;
}

/**
 * Points what the fork (`rulesetId`) and its characters keep that names what leaves with the book at what stands in its
 * place (`departures`), or refuses when one of the fork's rows names one with nothing in its place (a `ConflictError`
 * naming them), before anything changes. `copies` are the fork's copies of the book's entities, which the unsubscribe
 * reverts: their own rows go with them.
 */
export async function repointDepartingReferences(tx: Db, rulesetId: string, departures: Departures, copies: Copies) {
  const lost = [...new Set(await findLostReferences(tx, rulesetId, departures, copies))];
  if (lost.length > 0) {
    const more = lost.length > NAMED_LOSSES ? ` and ${lost.length - NAMED_LOSSES} more` : "";
    throw new ConflictError(
      `Cannot unsubscribe: this ruleset's content uses what only this extension has: ${lost.slice(0, NAMED_LOSSES).join("; ")}${more}`,
    );
  }

  const replaced = [...departures.values()].flatMap((fallbacks) =>
    [...fallbacks].filter(([, fallbackId]) => fallbackId).map(([id]) => id),
  );
  const named = new Set(await EntityReferences.findIds(tx, { entityIds: replaced, rulesetId }));
  for (const [entityType, fallbacks] of departures) {
    for (const [entityId, fallbackId] of fallbacks) {
      if (fallbackId && named.has(entityId))
        await EntityReferences.update(tx, { entityId: fallbackId }, { entityType, entityId, rulesetId });
    }
  }
}
