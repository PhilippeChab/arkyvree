import type { InferRequestType } from "hono/client";

import type { RulesetSave } from "@/client/src/hooks/index.ts";
import { wholeNumberError } from "@/client/src/lib/validation.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { MAX_SAVE_BASE } from "@/shared/dnd3.5/classes.ts";

type LevelJson = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["levels"][":levelId"]["$put"]
>["json"];

export type CreateLevelFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["levels"]["$post"]
>["json"];
export type LevelFeat = Pick<NonNullable<LevelJson["feats"]>[number], "featId" | "aptitudeId">;

export type LevelSave = NonNullable<LevelJson["saves"]>[number];

/**
 * Every ruleset save with its base at this level, 0 when unset: the shape the
 * level endpoints take. Until the ruleset's saves have loaded, the level's own
 * go out unchanged: the endpoints replace the list, so an empty one would
 * clear them.
 */
export function allLevelSaves(rulesetSaves: Pick<RulesetSave, "id">[] | undefined, saves: LevelSave[]): LevelSave[] {
  if (!rulesetSaves) return saves;
  return rulesetSaves.map((save) => ({ saveId: save.id, base: saves.find((s) => s.saveId === save.id)?.base ?? 0 }));
}

/** Whether every save's base is a whole number from 0 to `MAX_SAVE_BASE`: the saves field's `validate`, each input saying what's wrong (`saveBaseError`). */
export function areSaveBasesValid(saves: LevelSave[] | undefined) {
  return (saves ?? []).every((save) => saveBaseError(save.base) === undefined);
}

/** Identifies a granted feat: the same feat can be granted for several aptitudes. */
export function featKey(feat: LevelFeat) {
  return `${feat.featId}-${feat.aptitudeId}`;
}

/** A granted feat's label, the order a level's feats are kept in. */
export function levelFeatLabel(featName: string, aptitudeName: string | null | undefined) {
  return `${featName} (${aptitudeName || "Unknown"})`;
}

/** What's wrong with a save's base, if anything. */
export function saveBaseError(base: number) {
  return wholeNumberError(base, 0, MAX_SAVE_BASE);
}
