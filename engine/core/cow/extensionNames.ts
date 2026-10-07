import RulesError from "@/engine/core/RulesError.ts";

import { NAME_FALLBACK_ENTITY_TYPES } from "./sources.ts";

/**
 * Refuses subscribing a ruleset (`hostId`) to new extensions (`newExtensionIds`) that would surface two entities of a
 * name in its view, from the native names of the host's and its extensions' entities, the subscribed ones' and the new
 * ones' (`names`). Aptitudes pair by name in the view, whoever has them.
 */
export function checkExtensionNames(
  hostId: string,
  newExtensionIds: string[],
  names: { entityType: string; name: string; rulesetId: string }[],
) {
  const ownersByType = new Map<string, Map<string, Set<string>>>();
  for (const r of names) {
    if (r.entityType === "aptitudes") continue;
    let byName = ownersByType.get(r.entityType);
    if (!byName) {
      byName = new Map<string, Set<string>>();
      ownersByType.set(r.entityType, byName);
    }
    let set = byName.get(r.name);
    if (!set) {
      set = new Set<string>();
      byName.set(r.name, set);
    }
    set.add(r.rulesetId);
  }

  // Feats and powers participate in the runtime name-fallback pairing in
  // cow/ — extension-only collisions on those types get merged into one
  // entity at compose, so allow them. The host's own native rows can't be
  // sibling-paired (host isn't part of its own source chain), so a
  // host+extension collision would produce visible duplicates and must be
  // blocked even for paired types. All other entity types (races, classes,
  // abilities, etc.) have no name-fallback pairing — extension+extension
  // collisions there would surface as UI duplicates, so block them.
  const pairableTypes = new Set<string>(NAME_FALLBACK_ENTITY_TYPES);
  for (const [entityType, byName] of ownersByType) {
    const isPairableType = pairableTypes.has(entityType);
    for (const [name, ownerIds] of byName) {
      if (ownerIds.size <= 1) continue;
      const involvesNew = newExtensionIds.some((id) => ownerIds.has(id));
      if (!involvesNew) continue;
      if (isPairableType) {
        const involvesHost = ownerIds.has(hostId);
        if (!involvesHost) continue;
        throw new RulesError("conflict", `Cannot subscribe: ${entityType} "${name}" already exists in this ruleset`);
      }
      throw new RulesError(
        "conflict",
        `Cannot subscribe: ${entityType} "${name}" already exists in this ruleset or another subscribed extension`,
      );
    }
  }
}
