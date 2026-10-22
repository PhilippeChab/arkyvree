import { z } from "zod";

import { RulesError } from "@/engine/index.ts";
import type { Paginated, RulesetEntityType } from "@/server/repositories/index.ts";
import type { EntityBody } from "@/server/services/rulesets/EntityWriter.ts";
import type { Session } from "@/shared/relations.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

/**
 * A kind's services as its own service takes them: its list's filters by their schemas (`filters`, by query key: a
 * race's `kind`, a spell's `aptitudeId` and `level`), which its list takes read, and its groups' alike.
 */
interface TypedKind<F extends z.ZodRawShape, G extends z.ZodRawShape> extends Omit<KindServices, "grouped" | "list"> {
  filters: F;
  grouped?: {
    filters: G;
    list: (
      rulesetId: string,
      where: ListShared & z.output<z.ZodObject<G>>,
      pagination: Pagination,
    ) => Promise<Paginated<EntityGroup>>;
  };
  list: (
    rulesetId: string,
    where: ListShared & z.output<z.ZodObject<F>>,
    pagination: Pagination,
  ) => Promise<Paginated<EntityRow>>;
}

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
function readFilters<S extends z.ZodRawShape>(type: RulesetEntityType, shape: S, filters: Record<string, unknown>) {
  const unknown = Object.keys(filters).filter((key) => !Object.hasOwn(shape, key));
  if (unknown.length > 0) {
    const issues = unknown.map((key) => ({ category: key, message: `${getUrlSegment(type)} take no ${key} filter` }));
    throw new RulesError("invalid", "Request validation failed", issues);
  }
  return RulesError.parse(z.object(shape), filters);
}

/**
 * A kind's services (`kind`, of `type`), each list's filters read by its schemas before its service takes them, typed:
 * what the routes by kind dispatch to.
 */
export function buildKindServices<F extends z.ZodRawShape, G extends z.ZodRawShape>(
  type: RulesetEntityType,
  { filters, grouped, list, ...actions }: TypedKind<F, G>,
): KindServices {
  return {
    ...actions,
    grouped:
      grouped &&
      ((rulesetId, where, given, pagination) =>
        grouped.list(rulesetId, { ...where, ...readFilters(type, grouped.filters, given) }, pagination)),
    list: (rulesetId, where, given, pagination) =>
      list(rulesetId, { ...where, ...readFilters(type, filters, given) }, pagination),
  };
}
