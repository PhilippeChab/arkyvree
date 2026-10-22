import type {
  ClassLevelFormData,
  ClassLevelRow,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import type { Save } from "@/client/src/pages/rulesets/hooks/index.ts";

/** A feat a level grants, through the aptitude it's taken for: what its feats' column (`grantedFeats`) holds of it. */
export interface LevelFeat {
  aptitudeId: string;
  featId: string;
}

/** A save's base bonus at a level: what its saves' column (`saveBases`) holds of it. */
export interface LevelSave {
  base: number;
  saveId: string;
}

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
