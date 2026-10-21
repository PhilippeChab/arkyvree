import type { InferRequestType } from "hono/client";

import type {
  ClassLevelFormData,
  ClassLevelRow,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import type { Save } from "@/client/src/pages/rulesets/hooks/index.ts";
import type { rpc } from "@/client/src/services/rpc.ts";

type LevelJson = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["levels"][":levelId"]["$put"]
>["json"];

type LevelSave = NonNullable<LevelJson["saves"]>[number];

export type LevelFeat = Pick<NonNullable<LevelJson["feats"]>[number], "featId" | "aptitudeId">;

/** A class level's empty form: the first, which saves nothing and grants no feat. */
export const EMPTY_CLASS_LEVEL: ClassLevelFormData = { level: 1, saves: [], feats: [] };

/**
 * Every ruleset save with its base at this level, 0 when unset: the shape the
 * level endpoints take. Until the ruleset's saves have loaded, the level's own
 * go out unchanged: the endpoints replace the list, so an empty one would
 * clear them.
 */
export function allLevelSaves(rulesetSaves: Pick<Save, "id">[] | undefined, saves: LevelSave[]): LevelSave[] {
  if (!rulesetSaves) return saves;
  return rulesetSaves.map((save) => ({ saveId: save.id, base: saves.find((s) => s.saveId === save.id)?.base ?? 0 }));
}

/** Identifies a granted feat: the same feat can be granted for several aptitudes. */
export function featKey(feat: LevelFeat) {
  return `${feat.featId}-${feat.aptitudeId}`;
}

/** A granted feat's label, the order a level's feats are kept in. */
export function levelFeatLabel(featName: string, aptitudeName: string | null | undefined) {
  return `${featName} (${aptitudeName || "Unknown"})`;
}

/**
 * A class's next level, which its create dialog opens on: one above its highest, from whose saves it starts; a class
 * without levels starts from the first's empty form. Its declared fields start from the highest's too (the class
 * levels' section's `withEntityFields`).
 */
export function nextClassLevel(
  levels: readonly Pick<ClassLevelRow, "level" | "saves">[] | undefined,
): ClassLevelFormData {
  if (!levels?.length) return EMPTY_CLASS_LEVEL;
  const highest = levels.reduce((top, level) => (level.level > top.level ? level : top));
  return { level: highest.level + 1, saves: highest.saves.map(({ saveId, base }) => ({ saveId, base })), feats: [] };
}

/** A level's granted feats in the order its form keeps them, by their labels (`labelOf`): never their picking order. */
export function sortLevelFeats<F>(feats: readonly F[], labelOf: (feat: F) => string) {
  return feats.toSorted((a, b) => labelOf(a).localeCompare(labelOf(b)));
}
