import { z } from "zod";

import { RulesError } from "@/engine/index.ts";
import type { Paginated, RulesetEntityType } from "@/server/repositories/index.ts";
import type { EntityBody } from "@/server/services/rulesets/EntityWriter.ts";
import type { Session } from "@/shared/relations.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

/**
 * A kind's services as its own service takes them: its list (`list`, whose filters `W` names past the shared ones)
 * and the schema of each of those filters (`filters`, by query key: a race's `kind`, a spell's `aptitudeId` and
 * `level`), its groups' alike. The schemas are typed by the service's own filters: one it takes that they leave out, or
 * of another type, fails to compile (an extra one only where it's written in the kind's own object, never through a
 * shared constant, nor on a kind its service takes none of).
 */
interface TypedKind<W extends ListShared, G extends ListShared> extends Omit<KindServices, "grouped" | "list"> {
  filters: NoInfer<FilterSchemas<W>>;
  grouped?: {
    filters: NoInfer<FilterSchemas<G>>;
    list: (rulesetId: string, where: G, pagination: Pagination) => Promise<Paginated<EntityGroup>>;
  };
  list: (rulesetId: string, where: W, pagination: Pagination) => Promise<Paginated<EntityRow>>;
}

/** The schema of each filter a list takes past the shared ones (`W`'s), of its value's type. */
type FilterSchemas<W> = { [K in Exclude<keyof W, keyof ListShared>]-?: z.ZodType<W[K]> };

/** A group of a kind's list (a feat's family): its name, its key, how many it holds, and one of them. */
export interface EntityGroup {
  displayName: string;
  family: string | null;
  representativeId: string;
  variantCount: number;
}

/** A ruleset entity, any kind's, as its page or its list reads it: its row, with the fields it holds. */
export interface EntityRow {
  [key: string]: unknown;
  description: string | null;
  id: string;
  name: string;
  rulesetId: string;
}

/**
 * What one kind of entity answers, by its service, its filters read from a query's (`filters`, by key): its list and
 * its groups, its page, and what it lets a form do. None of an action it has none of.
 */
export interface KindServices {
  create?: (session: Session, rulesetId: string, body: EntityBody) => Promise<EntityRow>;
  duplicate?: (session: Session, rulesetId: string, sourceId: string, body: EntityBody) => Promise<EntityRow>;
  get: (rulesetId: string, entityId: string) => Promise<EntityRow>;
  grouped?: (
    rulesetId: string,
    where: ListShared,
    filters: Record<string, unknown>,
    pagination: Pagination,
  ) => Promise<Paginated<EntityGroup>>;
  list: (
    rulesetId: string,
    where: ListShared,
    filters: Record<string, unknown>,
    pagination: Pagination,
  ) => Promise<Paginated<EntityRow>>;
  remove?: (session: Session, rulesetId: string, entityId: string) => Promise<unknown>;
  /** The entities of a type others are made from (an item's templates of a type) */
  templates?: (rulesetId: string, type: string | undefined) => Promise<EntityRow[]>;
  update?: (session: Session, rulesetId: string, entityId: string, body: EntityBody) => Promise<EntityRow>;
  /** Copies of an entity, each its own name and description (an item's variants) */
  variants?: (session: Session, rulesetId: string, sourceId: string, variants: VariantBody[]) => Promise<unknown>;
}

/** What a list reads, every kind's: its search, its own entities alone, its order. */
export interface ListShared {
  childOnly?: boolean;
  orderBy?: "createdAt" | "name" | "updatedAt";
  orderDir?: "asc" | "desc";
  search?: string;
}

/** A page of a list. */
export interface Pagination {
  limit: number;
  page: number;
}

/** A variant's own name and description. */
export interface VariantBody {
  description?: string | null;
  name: string;
}

/**
 * A query's filters (`filters`) read by a kind's schemas (`shape`, of `type`'s list or groups): refused as invalid, by
 * key, as a route's validation refuses a query, when one isn't the kind's ("races take no level filter") or isn't of
 * its type.
 */
function readFilters<W extends ListShared>(
  type: RulesetEntityType,
  shape: FilterSchemas<W>,
  filters: Record<string, unknown>,
) {
  const unknown = Object.keys(filters).filter((key) => !Object.hasOwn(shape, key));
  if (unknown.length > 0) {
    const issues = unknown.map((key) => ({ category: key, message: `${getUrlSegment(type)} take no ${key} filter` }));
    throw new RulesError("invalid", "Request validation failed", issues);
  }
  // Every filter optional, however its schema is written: a list takes none
  return RulesError.parse(z.object<z.ZodRawShape>(shape).partial(), filters);
}

/**
 * A kind's services (`kind`, of `type`), each list's filters read by its schemas before its service takes them: what
 * the routes by kind dispatch to.
 */
export function buildKindServices<W extends ListShared, G extends ListShared>(
  type: RulesetEntityType,
  { filters, grouped, list, ...actions }: TypedKind<W, G>,
): KindServices {
  return {
    ...actions,
    // Each filter read by its schema, which `FilterSchemas` types as the service takes it
    grouped:
      grouped &&
      ((rulesetId, where, given, pagination) =>
        grouped.list(rulesetId, { ...where, ...readFilters(type, grouped.filters, given) } as G, pagination)),
    list: (rulesetId, where, given, pagination) =>
      list(rulesetId, { ...where, ...readFilters(type, filters, given) } as W, pagination),
  };
}
