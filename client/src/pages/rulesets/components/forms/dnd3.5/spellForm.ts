import type { InferRequestType } from "hono/client";

import type { rpc } from "@/client/src/services/rpc.ts";

export type SpellAptitude = SpellFormData["aptitudes"][number];

export type SpellFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["powers"]["$post"]>["json"];

/** A spell's aptitude and its level, without an empty `level` key so clearing one leaves the form clean. */
export function spellAptitude(id: string, level: number | null | undefined): SpellAptitude {
  return level == null ? { id } : { id, level };
}
