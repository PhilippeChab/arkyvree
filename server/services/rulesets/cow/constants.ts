import type { Db } from "@/server/database/index.ts";
import {
  Abilities,
  Aptitudes,
  Feats,
  Items,
  Klasses,
  Languages,
  Mechanics,
  Modifiers,
  Powers,
  Properties,
  Races,
  Requirements,
  Saves,
  Skills,
} from "@/server/repositories/index.ts";

import type { EntityType } from "./hashing.ts";

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

export interface EntityWithId {
  id: string;
  rulesetId: string;
  [key: string]: unknown;
}

// Tables that participate in the name-based sibling fallback. Limited to
// feats and powers because those are the entity types D&D sourcebooks
// commonly reprint (e.g. a spell appearing in CA + CD). For other entity
// types (races, classes, abilities, saves, skills, items, languages,
// mechanics) a same-name match across extensions is more likely a genuine
// collision than a reprint — auto-merging "Human" or "Fighter" between two
// homebrew packages would silently corrupt content. Aptitudes are also
// excluded; they have their own name-grouping pass since name = identity
// universally for them.
//
// `NAME_FALLBACK_ENTITY_TYPES` is the canonical list — re-export it from
// here and consume it in `RulesetExtensionsService.assertExtensionsNameCompatible`
// so the runtime pairing and the subscribe-time block agree on which
// types pair.
export const NAME_FALLBACK_ENTITY_TYPES = ["feats", "powers"] as const;

/**
 * What the COW code calls on any ruleset entity's repository. Properties, which TypeScript checks strictly, except
 * `create`: a method, whose looser check lets each repository's insert model stand for a copied row.
 */
interface EntityRepository {
  lockById: (db: Db, id: string, mode?: "update" | "share") => Promise<boolean>;
  exists: (db: Db, where: { id: string }) => Promise<boolean>;
  findOne: (db: Db, where: { id: string } | { name: string; rulesetId: string }) => Promise<EntityWithId | undefined>;
  findMany: (db: Db, where: { ids: string[] }) => Promise<EntityWithId[]>;
  create(db: Db, values: Record<string, unknown>): Promise<EntityWithId[]>;
  delete: (db: Db, where: { id: string }) => Promise<unknown>;
}

export const ENTITY_REPOS: Record<EntityType, EntityRepository> = {
  abilities: Abilities,
  saves: Saves,
  skills: Skills,
  feats: Feats,
  powers: Powers,
  items: Items,
  races: Races,
  languages: Languages,
  klasses: Klasses,
  aptitudes: Aptitudes,
  mechanics: Mechanics,
};

export const CUSTOMIZATION_REPOS = {
  property: Properties,
  requirement: Requirements,
  modifier: Modifiers,
} as const;

export type CustomizationKind = keyof typeof CUSTOMIZATION_REPOS;
