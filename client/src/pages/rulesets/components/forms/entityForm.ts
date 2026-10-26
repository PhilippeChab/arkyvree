import type { InferRequestType } from "hono/client";

import type { EntityKindDescription } from "@/client/src/lib/queries.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

import { toColumnsBody, toColumnValues } from "./entityFields.ts";

/**
 * A ruleset entity's form, any kind's, its create's and its edit's, where its save sends each value: its name, its
 * description, its fields by stored field and its links by role, its columns' among them, each as its input holds it
 * (`toEntityForm`), which its save sends as their bodies take them.
 */
export type EntityFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["entities"][":entityType"]["$post"]
>["json"];

/** An entity's form as its save sends it: its columns as their bodies take them (`toColumnsBody`), the rest as it is. */
export function toEntityBody<D extends object, B>(columns: readonly EntityField[], data: D): B {
  return toColumnsBody(columns, data as Record<string, unknown>) as B;
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

/**
 * An entity's form (`form`) with whether it's a template where its kind copies its entities (`copies`: its own flag
 * among its fields, an item's), which its columns show their template's fields by.
 */
export function withTemplateFlag<F extends EntityFormData>(
  form: F,
  copies: EntityKindDescription["copies"],
  template: boolean,
): F {
  return copies ? { ...form, fields: { ...form.fields, [copies.template.field]: template } } : form;
}
