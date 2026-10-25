import { Engine, type EntityKinds, type OwnedKind } from "@/engine/index.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

/** A ruleset entity type: a kind a module declares, which no other entity owns. */
export type RulesetEntityType = keyof EntityKinds;

/**
 * The kinds a user customizes (3.5's class levels, classes, feats, items, spells and races), in the order of their URLs'
 * words, which a route's refusal of another lists.
 */
export const CUSTOMIZABLE_TYPES: readonly string[] = Engine.storage()
  .customizableKinds()
  .toSorted((a, b) => getUrlSegment(a).localeCompare(getUrlSegment(b)));

/**
 * The roles of the links an entity's page edits one at a time, by role (3.5's class's skills), whose activities name
 * them: the kind each is from (the entity's) and the kind it's to.
 */
export const EDITED_LINKS: ReadonlyMap<string, { from: string; to: string }> = Engine.storage().editedLinks();

/** The kinds a name is the identity of, whose entities of one name in a ruleset's chain pair (3.5's pools). */
export const IDENTITY_TYPES: ReadonlySet<string> = new Set(Engine.storage().namesakeKinds("identity"));

/** Each kind another owns, by its table, and the kind that owns it (3.5's class levels, by their class), in order. */
export const OWNED_TYPES: ReadonlyMap<OwnedKind, RulesetEntityType> = new Map(
  Engine.storage()
    .registries()
    .entityTypes.flatMap((def) => (def.ownerType ? [[def.type as OwnedKind, def.ownerType as RulesetEntityType]] : [])),
);

/** Every ruleset entity type, in the order the modules declare them: those no other type owns. */
export const RULESET_ENTITY_TYPES = Engine.storage()
  .registries()
  .entityTypes.filter((def) => def.ownerType === null)
  .map((def) => def.type as RulesetEntityType);
