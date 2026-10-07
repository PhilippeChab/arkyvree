/**
 * What the classes give a feat reference's feats: the aptitudes and class levels of the bonus feat lists that name
 * them.
 */

import type { ClassReferenceFile } from "@/database/packages/dnd35-from-parser/tools/types/classes.ts";

/** Build map of feat name → additional aptitudes from the bonusFeatLists of a book's `classes`. */
export function getBonusFeatAptitudes(classes: ClassReferenceFile[]): Map<string, string[]> {
  const map = new Map<string, string[]>();

  function add(featName: string, aptitude: string) {
    const existing = map.get(featName) ?? [];
    if (!existing.includes(aptitude)) {
      existing.push(aptitude);
      map.set(featName, existing);
    }
  }

  for (const { ref } of classes) {
    // Bonus feat lists → aptitudes
    const lists = ref.detected?.bonusFeatLists;
    if (lists) {
      for (const list of lists) {
        for (const featName of list.feats) {
          add(featName, list.aptitude);
        }
      }
    }

    // "gains X as a bonus feat" in class feature descriptions → class feature aptitude
    const aptitude = ref.mapping?.classFeatureAptitude;
    if (!aptitude) continue;
    const grantRegex = /gains (?:the )?([A-Z][^.]*?) (?:feat [^.]*)?as a bonus feat/g;
    for (const cf of ref.raw.classFeatures) {
      let match: RegExpExecArray | null;
      while ((match = grantRegex.exec(cf.description)) !== null) {
        const name = match[1].replace(/\s*\([^)]*\)\s*$/, "").trim();
        add(name, aptitude);
      }
    }
  }
  return map;
}

/** Build map of feat name → the class levels of a book's `classes` that grant it as a bonus feat (for alternate prereqs). */
export function getBonusFeatClassLevels(
  classes: ClassReferenceFile[],
): Map<string, { classSlug: string; minLevel: number }[]> {
  const map = new Map<string, { classSlug: string; minLevel: number }[]>();

  for (const { file, ref } of classes) {
    const lists = ref.detected?.bonusFeatLists;
    if (!lists) continue;
    const classSlug = file.replace(".json", "");
    for (const list of lists) {
      if (!list.levels?.length) continue;
      const minLevel = Math.min(...list.levels);
      for (const featName of list.feats) {
        const existing = map.get(featName) ?? [];
        existing.push({ classSlug, minLevel });
        map.set(featName, existing);
      }
    }
  }
  return map;
}
