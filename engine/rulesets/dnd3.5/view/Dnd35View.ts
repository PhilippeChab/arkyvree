import type { RulesetData, ViewLink } from "@/engine/core/view/index.ts";
import { stripSeparators } from "@/shared/text.ts";

import type {
  Aptitude,
  Feat,
  Item,
  Klass,
  KlassLevel,
  Language,
  Mechanic,
  Race,
  RulesetAbility,
  RulesetSave,
  Skill,
  Spell,
} from "./rows.ts";

/** Each index 3.5's view builds on first read, and keeps. */
interface Indices {
  aptitudeIdBySlug: Map<string, string>;
  aptitudeIdsWithFeats: Set<string>;
  aptitudeIdsWithSpells: Set<string>;
  classLevelByClassAndLevel: Map<string, KlassLevel>;
  classLevelsByClass: Map<string, KlassLevel[]>;
  featIdBySlug: Map<string, string>;
  languageIdBySlug: Map<string, string>;
  spellIdsBySlug: Map<string, string[]>;
}

/** Rows' ids by their name's slug (`stripSeparators`): the first row of a slug wins, as the view lists them. */
function buildIdBySlug(rows: { id: string; name: string }[]): Map<string, string> {
  const idBySlug = new Map<string, string>();
  for (const row of rows) {
    const slug = stripSeparators(row.name);
    if (!idBySlug.has(slug)) idBySlug.set(slug, row.id);
  }
  return idBySlug;
}

/**
 * 3.5's view of a ruleset (`Dnd35View.of`): its kinds' rows as its rows, its entities' links by their roles (a class's
 * `classSkill` links, a class level's `grants` and `baseBonus`, a feat's or a spell's `listedIn`), and the indices its
 * rules read them by, derived once with the view and kept (`RulesetData.derive`). An index is built the first time
 * it's read; every id-keyed index takes a stored (pre-COW) id too, as the view's do.
 */
export default class Dnd35View {
  constructor(private readonly rulesetData: RulesetData) {}

  /** The view's 3.5 indices, derived once with it. */
  static of(rulesetData: RulesetData): Dnd35View {
    return rulesetData.derive(Dnd35View);
  }

  private readonly built: Partial<Indices> = {};

  /** Each entity's links of a role, by their targets' names, by role and entity, once read (`linksByName`). */
  private readonly sortedLinks = new Map<string, readonly ViewLink[]>();

  /**
   * An entity's links of a role to a kind (`entityId`, `role`, `toType`), by their targets' names (`rows`, the kind's
   * rows by id), as the books list them: a class's skills, a level's feats and spells. Kept once read.
   */
  private linksByName(entityId: string, role: string, toType: string, rows: ReadonlyMap<string, { name: string }>) {
    const key = `${role} ${toType} ${this.rulesetData.canonicalize(entityId)}`;
    let links = this.sortedLinks.get(key);
    if (!links) {
      links = this.rulesetData
        .linksOf(entityId, role, toType)
        .toSorted((a, b) => (rows.get(a.toId)?.name ?? "").localeCompare(rows.get(b.toId)?.name ?? ""));
      this.sortedLinks.set(key, links);
    }
    return links;
  }

  get abilities(): RulesetAbility[] {
    return this.rulesetData.rows("abilities");
  }

  get abilitiesById(): Map<string, RulesetAbility> {
    return this.rulesetData.byId("abilities");
  }

  /**
   * `stripSeparators(aptitude.name)` → aptitudeId, the first match winning: what modifier targets name an aptitude by
   * (`aptitudes.<slug>.…`), and what finalize, distribution, the pick queries and the loader map names through.
   */
  get aptitudeIdBySlug(): Map<string, string> {
    return (this.built.aptitudeIdBySlug ??= buildIdBySlug(this.aptitudes));
  }

  /** The aptitudes that have at least one feat listed in them, by the feats' `listedIn` links. */
  get aptitudeIdsWithFeats(): Set<string> {
    return (this.built.aptitudeIdsWithFeats ??= new Set(
      this.feats.flatMap((feat) => this.listLinksOf(feat.id).map((link) => link.toId)),
    ));
  }

  /** The aptitudes that have at least one spell listed in them, by the spells' `listedIn` links. */
  get aptitudeIdsWithSpells(): Set<string> {
    return (this.built.aptitudeIdsWithSpells ??= new Set(
      this.spells.flatMap((spell) => this.listLinksOf(spell.id).map((link) => link.toId)),
    ));
  }

  get aptitudes(): Aptitude[] {
    return this.rulesetData.rows("aptitudes");
  }

  get aptitudesById(): Map<string, Aptitude> {
    return this.rulesetData.byId("aptitudes");
  }

  /** A class level's base bonuses to the saves (`classLevelId`): its `baseBonus` links, each its save and its amount. */
  baseBonusesOf(classLevelId: string): readonly ViewLink[] {
    return this.rulesetData.linksOf(classLevelId, "baseBonus", "saves");
  }

  get classes(): Klass[] {
    return this.rulesetData.rows("classes");
  }

  get classesById(): Map<string, Klass> {
    return this.rulesetData.byId("classes");
  }

  /** Key: `${ownerId}:${position}`, a level's class and its number, the class's id resolved. */
  get classLevelByClassAndLevel(): Map<string, KlassLevel> {
    return (this.built.classLevelByClassAndLevel ??= this.rulesetData.resolvingCompositeKeys(
      new Map(this.classLevels.map((kl) => [`${kl.ownerId}:${kl.position}`, kl])),
    ));
  }

  get classLevels(): KlassLevel[] {
    return this.rulesetData.rows("class-levels");
  }

  /** A class's id → its levels (their owner), sorted by their number (`position`): the last is the class's highest. */
  get classLevelsByClass(): Map<string, KlassLevel[]> {
    return (this.built.classLevelsByClass ??= this.rulesetData.resolvingIds(
      Map.groupBy(
        this.classLevels.toSorted((a, b) => a.position - b.position),
        (kl) => kl.ownerId,
      ),
    ));
  }

  get classLevelsById(): Map<string, KlassLevel> {
    return this.rulesetData.byId("class-levels");
  }

  /** A class's class skills (`classId`): its `classSkill` links, by their skills' names, as the books list them. */
  classSkillsOf(classId: string): readonly ViewLink[] {
    return this.linksByName(classId, "classSkill", "skills", this.rulesetData.storedById("skills"));
  }

  /** `stripSeparators(feat.name)` → featId, the first match winning: the "set feats.<slug>.possessed" modifier scan. */
  get featIdBySlug(): Map<string, string> {
    return (this.built.featIdBySlug ??= buildIdBySlug(this.feats));
  }

  get feats(): Feat[] {
    return this.rulesetData.rows("feats");
  }

  get featsById(): Map<string, Feat> {
    return this.rulesetData.byId("feats");
  }

  /**
   * The feats a class level grants (`classLevelId`): its `grants` links to feats, each its feat and its pool (`viaId`)
   * and whether it's free, by their feats' names, as the books list them.
   */
  grantedFeatsOf(classLevelId: string): readonly ViewLink[] {
    return this.linksByName(classLevelId, "grants", "feats", this.rulesetData.storedById("feats"));
  }

  /**
   * The spells a class level grants (`classLevelId`): its `grants` links to spells, each its spell and its list
   * (`viaId`) and whether it's free, by their spells' names.
   */
  grantedSpellsOf(classLevelId: string): readonly ViewLink[] {
    return this.linksByName(classLevelId, "grants", "spells", this.rulesetData.storedById("spells"));
  }

  get items(): Item[] {
    return this.rulesetData.rows("items");
  }

  get itemsById(): Map<string, Item> {
    return this.rulesetData.byId("items");
  }

  /**
   * `stripSeparators(language.name)` → languageId, the first match winning: the "set languages.<slug>.known" modifier
   * scan.
   */
  get languageIdBySlug(): Map<string, string> {
    return (this.built.languageIdBySlug ??= buildIdBySlug(this.languages));
  }

  get languages(): Language[] {
    return this.rulesetData.rows("languages");
  }

  get languagesById(): Map<string, Language> {
    return this.rulesetData.byId("languages");
  }

  /** The spell lists a spell is on at a level: the aptitudes a link with a level points at, from any ruleset. */
  get leveledAptitudeIds(): Set<string> {
    return this.rulesetData.tieredIds;
  }

  /**
   * The ids of the ruleset's feats on a list, as the ruleset composes it: a ruleset taking several books merges each
   * feat's copies and each list's, and the winning copy takes every copy's links, so a query of a list's feats takes
   * these ids, never the stored links.
   */
  listFeatIds(aptitudeId: string): string[] {
    const listId = this.rulesetData.canonicalize(aptitudeId);
    return this.feats
      .filter((feat) => this.listLinksOf(feat.id).some((link) => link.toId === listId))
      .map((feat) => feat.id);
  }

  /**
   * The lists a feat or a spell is on (`entityId`): its `listedIn` links, each its list (an aptitude, `toId`) and, a
   * spell's, its level on it (`tier`).
   */
  listLinksOf(entityId: string): readonly ViewLink[] {
    return this.rulesetData.linksOf(entityId, "listedIn");
  }

  /**
   * The ids of the ruleset's spells on a list, as their `listedIn` links name it (`toId`, on any list when none is), at
   * a level when one is given (`tier`).
   */
  listSpellIds(where: { tier?: number; toId?: string }): string[] {
    const listId = where.toId === undefined ? undefined : this.rulesetData.canonicalize(where.toId);
    return this.spells
      .filter((spell) =>
        this.listLinksOf(spell.id).some(
          (link) => (listId === undefined || link.toId === listId) && (where.tier == null || link.tier === where.tier),
        ),
      )
      .map((spell) => spell.id);
  }

  get mechanics(): Mechanic[] {
    return this.rulesetData.rows("mechanics");
  }

  get races(): Race[] {
    return this.rulesetData.rows("races");
  }

  get racesById(): Map<string, Race> {
    return this.rulesetData.byId("races");
  }

  get saves(): RulesetSave[] {
    return this.rulesetData.rows("saves");
  }

  get savesById(): Map<string, RulesetSave> {
    return this.rulesetData.byId("saves");
  }

  get skills(): Skill[] {
    return this.rulesetData.rows("skills");
  }

  get skillsById(): Map<string, Skill> {
    return this.rulesetData.byId("skills");
  }

  /**
   * `stripSeparators(spell.name)` → spellIds (several spells can share a slug): the "set spells.<slug>.<apt>.known"
   * modifier scan. Resolve them through `spellsById`, as `featIdBySlug` pairs with `featsById`.
   */
  get spellIdsBySlug(): Map<string, string[]> {
    return (this.built.spellIdsBySlug ??= new Map(
      [...Map.groupBy(this.spells, (spell) => stripSeparators(spell.name))].map(([slug, group]) => [
        slug,
        group.map((spell) => spell.id),
      ]),
    ));
  }

  get spells(): Spell[] {
    return this.rulesetData.rows("spells");
  }

  get spellsById(): Map<string, Spell> {
    return this.rulesetData.byId("spells");
  }
}
