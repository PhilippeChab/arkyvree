import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";

import { toColumnsBody, toColumnValues } from "./entityFields.ts";

/** An entity's form as its save sends it: its columns as their bodies take them (`toColumnsBody`), the rest as it is. */
export function toEntityBody<D extends object, B>(columns: readonly EntityField[], data: D): B {
  return { ...data, ...toColumnsBody(columns, data as Record<string, unknown>) } as B;
}

/**
 * An entity's form, but its declared fields (`withEntityFields` joins them): its name, its description and its columns
 * (`columns`, its rules'), a new one's empty (`entity` none) or an entity's own.
 */
export function toEntityForm<F>(
  columns: readonly EntityField[],
  entity?: { description?: string | null; name: string },
): F {
  return {
    name: entity?.name ?? "",
    description: entity?.description ?? "",
    ...toColumnValues(columns, entity),
  } as F;
}
