import type { InferRequestType } from "hono/client";

import type { EntityKindDescription } from "@/client/src/lib/queries.ts";
import type { EntityField } from "@/client/src/pages/rulesets/details/rulesetQueries.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

import { toWholeBody, toWholeValues } from "./entityFields.ts";

/**
 * A ruleset entity's form, any kind's, its create's and its edit's, where its save sends each value: its name, its
 * description, its fields by stored field and its links by role, each as its input holds it (`toEntityForm`), which its
 * save sends as their bodies take them.
 */
export type EntityFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["entities"][":entityType"]["$post"]
>["json"];

/**
 * An entity's form as its save sends it: the fields it sends whole as their bodies take them (`toWholeBody`, of
 * `fields`, its rules'), the rest as it is.
 */
export function toEntityBody<D extends object, B>(fields: readonly EntityField[], data: D): B {
  return toWholeBody(fields, data as Record<string, unknown>) as B;
}

/**
 * An entity's form, but its fields among its others (`withEntityFields` joins them): its name, its description and the
 * fields it sends whole (`fields`, its rules': those beside its name, its lists of links), a new one's empty (`entity`
 * none) or an entity's own.
 */
export function toEntityForm<F>(
  fields: readonly EntityField[],
  entity?: { description?: string | null; name: string },
): F {
  return {
    name: entity?.name ?? "",
    description: entity?.description ?? "",
    ...toWholeValues(fields, entity),
  } as F;
}

/**
 * An entity's form (`form`) with whether it's a template where its kind copies its entities (`copies`: its own flag
 * among its fields, an item's), which the fields beside its name show their template's by.
 */
export function withTemplateFlag<F extends EntityFormData>(
  form: F,
  copies: EntityKindDescription["copies"],
  template: boolean,
): F {
  return copies ? { ...form, fields: { ...form.fields, [copies.template.field]: template } } : form;
}
