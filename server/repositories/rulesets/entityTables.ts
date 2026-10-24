import { Engine, type EntityKinds, type OwnedKind } from "@/engine/index.ts";

/** A ruleset entity type: a kind a module declares, which no other entity owns. */
export type RulesetEntityType = keyof EntityKinds;

/** The kinds a name is the identity of, whose entities of one name in a ruleset's chain pair (3.5's pools). */
export const IDENTITY_TYPES: ReadonlySet<string> = new Set(Engine.storage().namesakeKinds("identity"));

/** The joins the modules declare, by name: the kind each is from (its owner's: a class's skills') and the kind it's to. */
export const JOIN_ENDS: ReadonlyMap<string, { from: string; to: string }> = new Map(
  Engine.storage()
    .joinNames()
    .map((name) => {
      const { from, to } = Engine.storage().join(name);
      return [name, { from, to }];
    }),
);

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
