/**
 * What a fork keeps of a book it unsubscribes from, repaired before the book's content leaves it (`unsubscribeExtension`):
 * its feats' and spells' links to the book's lists (the book's own, and the fork's copies of them), and its classes'
 * level grants from those lists, are repointed to the list of the same name its remaining books give it. A list's name
 * is its identity: namesakes pair by it (`CowDataBuilder`). A reference the fork would lose refuses the unsubscribe: a
 * link to a list no remaining book has, or a row naming one of the book's other entities (an item's template, a
 * class's skill or granted feat…).
 */

import { buildSourceChain, CowDataBuilder, type RulesetSources } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";
import { ConflictError } from "@/server/errors/index.ts";
import {
  Aptitudes,
  FeatsAptitudes,
  KlassLevelFeats,
  KlassLevelPowers,
  KlassLevels,
  PowersAptitudes,
  RulesetEntities,
} from "@/server/repositories/index.ts";

/** The fork's copies of the book's entities, by entity type: what the unsubscribe deletes, references and all. */
type Copies = ReadonlyMap<string, string[]>;

/** How many lost references the refusal names. */
const NAMED_LOSSES = 10;

/** The entity types a fork's rows can name besides lists: what `RulesetEntities.findReferences` looks for. */
const REFERENCED_TYPES = ["abilities", "feats", "items", "klasses", "powers", "races", "saves", "skills"] as const;

/** The lists leaving the fork, by id, with their names: the book's own, and the fork's copies of them. */
async function findDepartingLists(tx: Db, extensionId: string, copies: Copies) {
  const lists = [
    ...(await Aptitudes.findMany(tx, { rulesetIds: [extensionId] })),
    ...(await Aptitudes.findMany(tx, { ids: copies.get("aptitudes") ?? [] })),
  ];
  return new Map(lists.map((list) => [list.id, list.name]));
}

/** The lists the fork keeps once the book is gone, by name: the ones its view will show. */
async function findKeptLists(tx: Db, ruleset: RulesetSources, extensionId: string, departing: Map<string, string>) {
  const remaining = { ...ruleset, extensionRulesetIds: ruleset.extensionRulesetIds.filter((id) => id !== extensionId) };
  const cow = await CowDataBuilder.build(tx, remaining);
  const lists = await Aptitudes.findMany(tx, { rulesetIds: [ruleset.id, ...buildSourceChain(remaining)] });
  const kept = lists.filter((list) => !cow.isHidden(list.id) && !departing.has(list.id));
  return new Map(kept.map((list) => [list.name, list.id]));
}

/**
 * What the fork keeps that names the book's entities (or the fork's copies of them) other than its lists, each of
 * which would dangle once they're gone (`RulesetEntities.findReferences`): an item's template, a class's skill or
 * granted feat… The rows the unsubscribe deletes, the copies, are left out.
 */
async function findLostReferences(tx: Db, rulesetId: string, extensionId: string, copies: Copies) {
  const names = new Map<string, string>();
  for (const type of REFERENCED_TYPES) {
    const entities = [
      ...(await RulesetEntities.findNames(tx, type, { rulesetId: extensionId })),
      ...(await RulesetEntities.findNames(tx, type, { ids: copies.get(type) ?? [] })),
    ];
    for (const entity of entities) names.set(entity.id, entity.name);
  }
  const deleted = new Set([...copies.values()].flat());
  const references = await RulesetEntities.findReferences(tx, { rulesetId, entityIds: [...names.keys()] });
  return references
    .filter((reference) => !deleted.has(reference.id))
    .map((reference) => `${reference.name}, which uses ${names.get(reference.targetId)}`);
}

/** Repoints the fork's feats' links: to the kept list, or out when the feat links to it already. */
async function repointFeatLinks(
  tx: Db,
  links: { aptitudeId: string; featId: string }[],
  keptOf: (id: string) => string,
) {
  const featIds = [...new Set(links.map((link) => link.featId))];
  const linked = new Set(
    (await FeatsAptitudes.findMany(tx, { featIds })).map((link) => `${link.featId}|${link.aptitudeId}`),
  );
  for (const link of links) {
    const aptitudeId = keptOf(link.aptitudeId);
    if (linked.has(`${link.featId}|${aptitudeId}`)) {
      await FeatsAptitudes.delete(tx, link);
      continue;
    }
    await FeatsAptitudes.update(tx, { aptitudeId }, link);
    linked.add(`${link.featId}|${aptitudeId}`);
  }
}

/** Repoints the fork's spells' links: to the kept list, or out when the spell links to it already. */
async function repointPowerLinks(
  tx: Db,
  links: { aptitudeId: string; powerId: string }[],
  keptOf: (id: string) => string,
) {
  const powerIds = [...new Set(links.map((link) => link.powerId))];
  const linked = new Set(
    (await PowersAptitudes.findMany(tx, { powerIds })).map((link) => `${link.powerId}|${link.aptitudeId}`),
  );
  for (const link of links) {
    const aptitudeId = keptOf(link.aptitudeId);
    if (linked.has(`${link.powerId}|${aptitudeId}`)) {
      await PowersAptitudes.delete(tx, link);
      continue;
    }
    await PowersAptitudes.update(tx, { aptitudeId }, link);
    linked.add(`${link.powerId}|${aptitudeId}`);
  }
}

/**
 * Repoints, before the book leaves `ruleset`, what the fork keeps that names the book's lists, to its lists of the same
 * name, or refuses when a reference would be lost (a `ConflictError` naming them). `copies` are the fork's copies of the
 * book's entities, which the unsubscribe deletes: their own references go with them.
 */
export async function repointDepartingReferences(tx: Db, ruleset: RulesetSources, extensionId: string, copies: Copies) {
  const departing = await findDepartingLists(tx, extensionId, copies);
  const kept = await findKeptLists(tx, ruleset, extensionId, departing);
  const keptOf = (aptitudeId: string) => kept.get(departing.get(aptitudeId) ?? "");
  const aptitudeIds = [...departing.keys()];
  const deletedFeats = new Set(copies.get("feats"));
  const deletedPowers = new Set(copies.get("powers"));
  const deletedLevels = new Set(
    (await KlassLevels.findMany(tx, { klassIds: copies.get("klasses") ?? [] })).map((level) => level.id),
  );
  const featLinks = (await FeatsAptitudes.findMany(tx, { rulesetId: ruleset.id, aptitudeIds })).filter(
    (link) => !deletedFeats.has(link.featId),
  );
  const powerLinks = (await PowersAptitudes.findMany(tx, { rulesetId: ruleset.id, aptitudeIds })).filter(
    (link) => !deletedPowers.has(link.powerId),
  );
  const featGrants = (await KlassLevelFeats.findMany(tx, { rulesetId: ruleset.id, aptitudeIds })).filter(
    (grant) => !deletedLevels.has(grant.klassLevelId),
  );
  const powerGrants = (await KlassLevelPowers.findMany(tx, { rulesetId: ruleset.id, aptitudeIds })).filter(
    (grant) => !deletedLevels.has(grant.klassLevelId),
  );

  const lost = [
    ...[...featLinks, ...powerLinks, ...featGrants, ...powerGrants]
      .filter((reference) => !keptOf(reference.aptitudeId))
      .map((reference) => `${departing.get(reference.aptitudeId)}, a list no other book of this ruleset has`),
    ...(await findLostReferences(tx, ruleset.id, extensionId, copies)),
  ];
  if (lost.length > 0) {
    const named = [...new Set(lost)];
    const more = named.length > NAMED_LOSSES ? ` and ${named.length - NAMED_LOSSES} more` : "";
    throw new ConflictError(
      `Cannot unsubscribe: this ruleset's content uses what only this extension has: ${named.slice(0, NAMED_LOSSES).join("; ")}${more}`,
    );
  }

  const keptId = (aptitudeId: string) => keptOf(aptitudeId) ?? aptitudeId;
  await repointFeatLinks(tx, featLinks, keptId);
  await repointPowerLinks(tx, powerLinks, keptId);
  for (const grant of featGrants) await KlassLevelFeats.update(tx, { aptitudeId: keptId(grant.aptitudeId) }, grant);
  for (const grant of powerGrants) await KlassLevelPowers.update(tx, { aptitudeId: keptId(grant.aptitudeId) }, grant);
}
