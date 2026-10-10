import { z } from "zod";

import type { Accepted } from "@/engine/index.ts";
import { isRecord } from "@/shared/isRecord.ts";
import { getEntityTypeOfSegment, getUrlSegments } from "@/shared/urlSegments.ts";

/**
 * The fields an entity's body carries for its ruleset's rules, as the engine's plan of it (`P`) takes them: as every
 * registered ruleset's takes them (`Accepted`).
 */
type PlanFields<P extends (body: never) => unknown> = Accepted<P>[0] extends { fields?: infer F }
  ? NonNullable<F>
  : never;

/**
 * An entity's fields, as a body carries them for its ruleset's rules (`fields`): any object, which the engine reads by
 * the entity kind's fields and refuses as invalid when one isn't its field's type or in its bounds. Typed as the
 * engine's plan of the body (`P`: `EntityKinds["skills"]["planCreate"]`) takes them, so the client's forms keep their
 * types.
 */
export function buildEntityFieldsSchema<P extends (body: never) => unknown>() {
  return z.custom<PlanFields<P>>((value) => isRecord(value), "Expected an object of the entity's fields");
}

/**
 * An entity type in a URL, named by its segment ("class-levels", "classes"): the route hands its service the type
 * (`klass_levels`, `klasses`).
 */
export function buildEntityTypeSchema<T extends string>(entityTypes: readonly T[]) {
  return z.enum(getUrlSegments(entityTypes)).transform((segment) => getEntityTypeOfSegment(segment));
}

/**
 * Comma-separated `id:aptitudeId` picks in a query (a feat's or a power's id, and the pool it's picked in), each read as
 * the id under `idKey` and its pool's: what isn't one is dropped.
 */
export function buildPickPairsSchema<K extends string>(idKey: K) {
  return z
    .string()
    .optional()
    .transform((value) =>
      value
        ?.split(",")
        .map((pair) => {
          const [id, aptitudeId] = pair.split(":");
          return { [idKey]: id, aptitudeId } as Record<K, string> & { aptitudeId: string };
        })
        .filter((pick) => isUuid(pick[idKey]) && isUuid(pick.aptitudeId)),
    );
}

/** Whether `value` is a UUID: what a list of ids in a query keeps. */
export function isUuid(value: string) {
  return z.string().uuid().safeParse(value).success;
}

/** A page size: 1–100, defaulting to `fallback` */
export function limitDefaultingTo(fallback: number) {
  return z.coerce.number().min(1).max(100).default(fallback);
}
