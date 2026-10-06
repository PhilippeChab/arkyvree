/**
 * What the classes give a feat reference's feats: the aptitudes and class levels of the bonus feat lists that name
 * them.
 */

import ReferenceLoader from "@/database/packages/dnd35-from-parser/tools/referenceLoader.ts";

/** Build map of feat name → additional aptitudes from all class bonusFeatLists in a given book. */
export function loadBonusFeatAptitudes(book: string): Map<string, string[]> {
  const map = new Map<string, string[]>();

  function add(featName: string, aptitude: string) {
    const existing = map.get(featName) ?? [];
    if (!existing.includes(aptitude)) {
      existing.push(aptitude);
      map.set(featName, existing);
    }
  }

  for (const { ref } of ReferenceLoader.loadClasses(book)) {
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

/** Build map of feat name → class levels that grant it as a bonus feat (for alternate prereqs). */
export function loadBonusFeatClassLevels(book: string): Map<string, { classSlug: string; minLevel: number }[]> {
  const map = new Map<string, { classSlug: string; minLevel: number }[]>();

  for (const { file, ref } of ReferenceLoader.loadClasses(book)) {
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
