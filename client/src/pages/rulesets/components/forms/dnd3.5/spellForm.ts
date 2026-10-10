import type { InferRequestType } from "hono/client";

import { wholeNumberError } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { MAX_SPELL_LEVEL } from "@/vocabulary/dnd3.5/spells.ts";

export type SpellAptitude = SpellFormData["aptitudes"][number];

export type SpellFormData = InferRequestType<(typeof rpc.api.rulesets)[":id"]["powers"]["$post"]>["json"];

/** Whether every aptitude's level is unset or from 0 to `MAX_SPELL_LEVEL`: the aptitudes field's `validate`, each input saying what's wrong (`spellLevelError`). */
export function areSpellLevelsValid(aptitudes: SpellAptitude[] | undefined) {
  return (aptitudes ?? []).every((aptitude) => spellLevelError(aptitude.level) === undefined);
}

/** A spell's aptitude and its level, without an empty `level` key so clearing one leaves the form clean. */
export function spellAptitude(id: string, level: number | null | undefined): SpellAptitude {
  return level == null ? { id } : { id, level };
}

/** What's wrong with an aptitude's spell level, if anything. */
export function spellLevelError(level: number | undefined) {
  return level === undefined ? undefined : wholeNumberError(level, 0, MAX_SPELL_LEVEL);
}
