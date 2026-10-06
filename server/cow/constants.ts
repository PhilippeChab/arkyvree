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

/**
 * What the COW code calls on any ruleset entity's repository. Properties, which TypeScript checks strictly, except
 * `create`: a method, whose looser check lets each repository's insert model stand for a copied row.
 */
interface EntityRepository {
  lock: (db: Db, where: { id: string }, mode?: "update" | "share") => Promise<boolean>;
  exists: (db: Db, where: { id: string }) => Promise<boolean>;
  findOne: (db: Db, where: { id: string } | { name: string; rulesetId: string }) => Promise<EntityWithId | undefined>;
  findMany: (db: Db, where: { ids: string[] }) => Promise<EntityWithId[]>;
  create(db: Db, values: Record<string, unknown>): Promise<EntityWithId[]>;
  delete: (db: Db, where: { id: string }) => Promise<unknown>;
}

export interface EntityWithId {
  id: string;
  rulesetId: string;
  [key: string]: unknown;
}

export type CustomizationKind = keyof typeof CUSTOMIZATION_REPOS;

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
