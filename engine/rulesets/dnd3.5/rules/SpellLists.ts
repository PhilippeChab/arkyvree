import type { RulesetData } from "@/engine/core/view/index.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import { stripSeparators } from "@/shared/text.ts";

/**
 * The spell lists of a ruleset's view, derived once and kept with it (`SpellLists.of`): those its classes and feats
 * open, those leveled by spell, and each list's spell-possession slug (`powers.<spell>.<slug>.known`).
 */
export default class SpellLists {
  constructor(private readonly rulesetData: RulesetData) {}

  /** The spell list a modifier gives slots in or joins to its class's list, if it does either. */
  static listOpenedBy(target: string): string | undefined {
    return AptitudeTargets.parseSpellLevel(target)?.list ?? AptitudeTargets.parseJoin(target);
  }

  /** The view's spell lists, derived once with it. */
  static of(rulesetData: RulesetData): SpellLists {
    return rulesetData.derive(SpellLists);
  }

  /**
   * The slug of a spell list's possession paths, from its aptitude's name without the " Spells" suffix ("Wizard Spells"
   * → "wizard", "Knowledge Domain Spells" → "knowledgedomain").
   */
  static toSpellPossessionSlug(aptitudeName: string) {
    return stripSeparators(aptitudeName.replace(/ Spells$/, ""));
  }

  /** What it derived, each the first time it's read. */
  private readonly built: {
    aptitudeIdBySpellSlug?: Map<string, string>;
    classListIds?: Set<string>;
    classListsByKlass?: Map<string, Set<string>>;
    featListIds?: Set<string>;
    leveledAptitudeIds?: Set<string>;
    spellSlugByAptitudeId?: Map<string, string>;
  } = {};

  /** A list's aptitude id by its spell-possession slug: the first of a slug wins, as the view lists them. */
  get aptitudeIdBySpellSlug(): Map<string, string> {
    if (this.built.aptitudeIdBySpellSlug) return this.built.aptitudeIdBySpellSlug;
    const aptitudeIdBySpellSlug = new Map<string, string>();
    for (const [aptitudeId, slug] of this.spellSlugByAptitudeId)
      if (!aptitudeIdBySpellSlug.has(slug)) aptitudeIdBySpellSlug.set(slug, aptitudeId);
    return (this.built.aptitudeIdBySpellSlug = aptitudeIdBySpellSlug);
  }

  /** The spell lists the ruleset's class levels give slots in, by aptitude id: each a class's own (`classListsByKlass`). */
  get classListIds(): Set<string> {
    return (this.built.classListIds ??= new Set(
      [...this.classListsByKlass.values()].flatMap((lists) =>
        [...lists].flatMap((list) => this.rulesetData.aptitudeIdBySlug.get(list) ?? []),
      ),
    ));
  }

  /**
   * Each class's spell lists, by its id: those its levels give slots in (each class's levels by level), a level no
   * character has taken yet included (a paladin's before his fourth), each with spells on it or none yet (a divine
   * crusader's: her domain's join it).
   */
  get classListsByKlass(): Map<string, Set<string>> {
    if (this.built.classListsByKlass) return this.built.classListsByKlass;
    const { klassLevels, modifiersBySource } = this.rulesetData;
    const classListsByKlass = new Map<string, Set<string>>();
    for (const klassLevel of klassLevels.toSorted((a, b) => a.level - b.level)) {
      for (const modifier of modifiersBySource.get(klassLevel.id) ?? []) {
        const list = AptitudeTargets.parseSpellLevel(modifier.target)?.list;
        if (list === undefined) continue;
        const lists = classListsByKlass.get(klassLevel.klassId) ?? new Set<string>();
        lists.add(list);
        classListsByKlass.set(klassLevel.klassId, lists);
      }
    }
    return (this.built.classListsByKlass = classListsByKlass);
  }

  /**
   * The spell lists a feat brings: those the ruleset's feats give slots in or join to a class's list, and no class gives
   * slots in (a cleric's domains, a specialist wizard's schools; a feat's extra slot in a class's own list leaves it the
   * class's). Their spells come with the feat, never learned; their slots follow the feat's class's spell levels.
   */
  get featListIds(): Set<string> {
    if (this.built.featListIds) return this.built.featListIds;
    const { aptitudeIdBySlug, feats, modifiersBySource } = this.rulesetData;
    const featListIds = new Set<string>();
    for (const feat of feats) {
      for (const modifier of modifiersBySource.get(feat.id) ?? []) {
        const list = SpellLists.listOpenedBy(modifier.target);
        const id = list === undefined ? undefined : aptitudeIdBySlug.get(list);
        if (id && !this.classListIds.has(id)) featListIds.add(id);
      }
    }
    return (this.built.featListIds = featListIds);
  }

  /**
   * The lists leveled by spell: a list with spells at a level, or one a class or a feat gives slots in before it has
   * any, or with none of its own (a cleric's domain slot, which his domains' spells fill).
   */
  get leveledAptitudeIds(): Set<string> {
    if (this.built.leveledAptitudeIds) return this.built.leveledAptitudeIds;
    const leveledAptitudeIds = new Set([...this.classListIds, ...this.featListIds]);
    for (const power of this.rulesetData.powers)
      for (const link of power.powersAptitudesInRules) if (link.level != null) leveledAptitudeIds.add(link.aptitudeId);
    return (this.built.leveledAptitudeIds = leveledAptitudeIds);
  }

  /** Each list's spell-possession slug (`powers.<spell>.<slug>.known`), by its aptitude id. */
  get spellSlugByAptitudeId(): Map<string, string> {
    return (this.built.spellSlugByAptitudeId ??= new Map(
      this.rulesetData.aptitudes.map((aptitude) => [aptitude.id, SpellLists.toSpellPossessionSlug(aptitude.name)]),
    ));
  }
}
