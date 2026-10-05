import type { InferRequestType } from "hono/client";

import type { RulesetSave } from "@/client/src/hooks/index.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

type LevelJson = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["levels"][":levelId"]["$put"]
>["json"];

export type LevelSave = NonNullable<LevelJson["saves"]>[number];
export type LevelFeat = Pick<NonNullable<LevelJson["feats"]>[number], "featId" | "aptitudeId">;

export type CreateLevelFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["levels"]["$post"]
>["json"];

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

/** A granted feat's label, the order a level's feats are kept in. */
export const levelFeatLabel = (featName: string, aptitudeName: string | null | undefined) =>
  `${featName} (${aptitudeName || "Unknown"})`;

/** Identifies a granted feat: the same feat can be granted for several aptitudes. */
export const featKey = (feat: LevelFeat) => `${feat.featId}-${feat.aptitudeId}`;
