import type { RulesetData } from "@/engine/core/view/index.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/aptitudes/AptitudeTargets.ts";

/** The spell lists a character's classes and feats open. */
export default class SpellLists {
  /** The spell lists the ruleset's class levels give slots in, by aptitude id: each a class's own (`collectClassLists`). */
  static collectClassListIds(
    rulesetData: Pick<RulesetData, "klassLevels" | "modifiersBySource" | "aptitudeIdBySlug">,
  ): Set<string> {
    const ids = new Set<string>();
    for (const lists of SpellLists.collectClassLists(rulesetData).values()) {
      for (const list of lists) {
        const id = rulesetData.aptitudeIdBySlug.get(list);
        if (id) ids.add(id);
      }
    }
    return ids;
  }

  /**
   * Each class's spell lists, by its id: those its levels give slots in, a level no character has taken yet included (a
   * paladin's before his fourth), each with spells on it or none yet (a divine crusader's: her domain's join it).
   */
  static collectClassLists({
    klassLevels,
    modifiersBySource,
  }: Pick<RulesetData, "klassLevels" | "modifiersBySource">): Map<string, Set<string>> {
    const listsByKlassId = new Map<string, Set<string>>();
    for (const klassLevel of klassLevels) {
      for (const modifier of modifiersBySource.get(klassLevel.id) ?? []) {
        const list = AptitudeTargets.parseSpellLevel(modifier.target)?.list;
        if (list === undefined) continue;
        const lists = listsByKlassId.get(klassLevel.klassId) ?? new Set<string>();
        lists.add(list);
        listsByKlassId.set(klassLevel.klassId, lists);
      }
    }
    return listsByKlassId;
  }

  /**
   * The spell lists a feat brings: those the ruleset's feats give slots in or join to a class's list, and no class gives
   * slots in (a cleric's domains, a specialist wizard's schools; a feat's extra slot in a class's own list leaves it the
   * class's). Their spells come with the feat, never learned; their slots follow the feat's class's spell levels.
   */
  static collectFeatListIds(
    rulesetData: Pick<RulesetData, "feats" | "klassLevels" | "modifiersBySource" | "aptitudeIdBySlug">,
  ): Set<string> {
    const { feats, modifiersBySource, aptitudeIdBySlug } = rulesetData;
    const classListIds = SpellLists.collectClassListIds(rulesetData);
    const ids = new Set<string>();
    for (const feat of feats) {
      for (const modifier of modifiersBySource.get(feat.id) ?? []) {
        const list = SpellLists.listOpenedBy(modifier.target);
        const id = list === undefined ? undefined : aptitudeIdBySlug.get(list);
        if (id && !classListIds.has(id)) ids.add(id);
      }
    }
    return ids;
  }

  /** The spell list a modifier gives slots in or joins to its class's list, if it does either. */
  static listOpenedBy(target: string): string | undefined {
    return AptitudeTargets.parseSpellLevel(target)?.list ?? AptitudeTargets.parseJoin(target);
  }
}
