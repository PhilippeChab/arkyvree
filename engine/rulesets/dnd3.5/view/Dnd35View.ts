import type { RulesetData } from "@/engine/core/view/index.ts";
import { stripSeparators } from "@/shared/text.ts";

import type {
  Aptitude,
  FeatWithAptitudes,
  Item,
  Klass,
  KlassLevel,
  KlassLevelFeat,
  KlassLevelSave,
  KlassLevelSpell,
  KlassSkill,
  Language,
  Mechanic,
  Race,
  RulesetAbility,
  RulesetSave,
  Skill,
  SpellWithAptitudes,
} from "./rows.ts";

/** Each index 3.5's view builds on first read, and keeps. */
interface Indices {
  aptitudeIdBySlug: Map<string, string>;
  aptitudeIdsWithFeats: Set<string>;
  aptitudeIdsWithSpells: Set<string>;
  featIdBySlug: Map<string, string>;
  klassLevelByKlassAndLevel: Map<string, KlassLevel>;
  klassLevelFeatsByKlassLevel: Map<string, KlassLevelFeat[]>;
  klassLevelFeatsWithFeatsByKlassLevel: Map<string, (KlassLevelFeat & { featsInRule: FeatWithAptitudes })[]>;
  klassLevelSavesByKlassLevel: Map<string, KlassLevelSave[]>;
  klassLevelsByKlass: Map<string, KlassLevel[]>;
  klassLevelSpellsWithSpellsByKlassLevel: Map<string, (KlassLevelSpell & { spellsInRule: SpellWithAptitudes })[]>;
  klassSkillsByKlass: Map<string, KlassSkill[]>;
  klassSkillsWithSkillsByKlass: Map<string, (KlassSkill & { skillsInRule: Skill })[]>;
  languageIdBySlug: Map<string, string>;
  /** A class's skills and a level's feats and spells by name, as the books list them */
  sortedKlassLevelFeats: KlassLevelFeat[];
  sortedKlassLevelSpells: KlassLevelSpell[];
  sortedKlassSkills: KlassSkill[];
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
 * 3.5's view of a ruleset (`Dnd35View.of`): its kinds' rows and joins' as its rows, and the indices its rules read them
 * by, derived once with the view and kept (`RulesetData.derive`). An index is built the first time it's read; every
 * id-keyed index takes a stored (pre-COW) id too, as the view's do.
 */
export default class Dnd35View {
  constructor(private readonly rulesetData: RulesetData) {}

  /** The view's 3.5 indices, derived once with it. */
  static of(rulesetData: RulesetData): Dnd35View {
    return rulesetData.derive(Dnd35View);
  }

  private readonly built: Partial<Indices> = {};

  /** A level's feats by name, as the books list them. */
  private get sortedKlassLevelFeats(): KlassLevelFeat[] {
    const feats = this.rulesetData.storedById("feats");
    return (this.built.sortedKlassLevelFeats ??= this.rulesetData
      .joinRows("class_level_feats")
      .toSorted((a, b) => (feats.get(a.featId)?.name ?? "").localeCompare(feats.get(b.featId)?.name ?? "")));
  }

  /** A level's spells by name, as the books list them. */
  private get sortedKlassLevelSpells(): KlassLevelSpell[] {
    const spells = this.rulesetData.storedById("spells");
    return (this.built.sortedKlassLevelSpells ??= this.rulesetData
      .joinRows("class_level_spells")
      .toSorted((a, b) => (spells.get(a.spellId)?.name ?? "").localeCompare(spells.get(b.spellId)?.name ?? "")));
  }

  /** A class's skills by name, as the books list them. */
  private get sortedKlassSkills(): KlassSkill[] {
    const skills = this.rulesetData.storedById("skills");
    return (this.built.sortedKlassSkills ??= this.rulesetData
      .joinRows("class_skills")
      .toSorted((a, b) => (skills.get(a.skillId)?.name ?? "").localeCompare(skills.get(b.skillId)?.name ?? "")));
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

  /** The aptitudes that have at least one feat linked, from the feats' inline `featsAptitudesInRules` rows. */
  get aptitudeIdsWithFeats(): Set<string> {
    return (this.built.aptitudeIdsWithFeats ??= new Set(
      this.feats.flatMap((feat) => feat.featsAptitudesInRules.map((l) => l.aptitudeId)),
    ));
  }

  /** The aptitudes that have at least one spell linked, from the spells' inline `spellsAptitudesInRules` rows. */
  get aptitudeIdsWithSpells(): Set<string> {
    return (this.built.aptitudeIdsWithSpells ??= new Set(
      this.spells.flatMap((spell) => spell.spellsAptitudesInRules.map((l) => l.aptitudeId)),
    ));
  }

  get aptitudes(): Aptitude[] {
    return this.rulesetData.rows("aptitudes");
  }

  get aptitudesById(): Map<string, Aptitude> {
    return this.rulesetData.byId("aptitudes");
  }

  /** `stripSeparators(feat.name)` → featId, the first match winning: the "set feats.<slug>.possessed" modifier scan. */
  get featIdBySlug(): Map<string, string> {
    return (this.built.featIdBySlug ??= buildIdBySlug(this.feats));
  }

  get feats(): FeatWithAptitudes[] {
    return this.rulesetData.rows("feats");
  }

  get featsById(): Map<string, FeatWithAptitudes> {
    return this.rulesetData.byId("feats");
  }

  get items(): Item[] {
    return this.rulesetData.rows("items");
  }

  get itemsById(): Map<string, Item> {
    return this.rulesetData.byId("items");
  }

  get klasses(): Klass[] {
    return this.rulesetData.rows("classes");
  }

  get klassesById(): Map<string, Klass> {
    return this.rulesetData.byId("classes");
  }

  /** Key: `${klassId}:${level}`, the class's id resolved. */
  get klassLevelByKlassAndLevel(): Map<string, KlassLevel> {
    return (this.built.klassLevelByKlassAndLevel ??= this.rulesetData.resolvingCompositeKeys(
      new Map(this.klassLevels.map((kl) => [`${kl.klassId}:${kl.level}`, kl])),
    ));
  }

  /** klassLevelId → its granted feats, the links alone (`klassLevelFeatsWithFeatsByKlassLevel` joins the feats). */
  get klassLevelFeatsByKlassLevel(): Map<string, KlassLevelFeat[]> {
    return (this.built.klassLevelFeatsByKlassLevel ??= this.rulesetData.resolvingIds(
      Map.groupBy(this.sortedKlassLevelFeats, (klf) => klf.klassLevelId),
    ));
  }

  /** klassLevelId → its granted feats joined with their feats: a link whose feat isn't in the view is left out. */
  get klassLevelFeatsWithFeatsByKlassLevel(): Map<string, (KlassLevelFeat & { featsInRule: FeatWithAptitudes })[]> {
    const feats = this.rulesetData.storedById("feats");
    return (this.built.klassLevelFeatsWithFeatsByKlassLevel ??= this.rulesetData.resolvingIds(
      Map.groupBy(
        this.sortedKlassLevelFeats.flatMap((klf) => {
          const feat = feats.get(klf.featId);
          return feat ? [{ ...klf, featsInRule: feat }] : [];
        }),
        (joined) => joined.klassLevelId,
      ),
    ));
  }

  get klassLevels(): KlassLevel[] {
    return this.rulesetData.rows("class_levels");
  }

  get klassLevelSaves(): KlassLevelSave[] {
    return this.rulesetData.joinRows("class_level_saves");
  }

  get klassLevelSavesByKlassLevel(): Map<string, KlassLevelSave[]> {
    return (this.built.klassLevelSavesByKlassLevel ??= this.rulesetData.resolvingIds(
      Map.groupBy(this.klassLevelSaves, (kls) => kls.klassLevelId),
    ));
  }

  get klassLevelsById(): Map<string, KlassLevel> {
    return this.rulesetData.byId("class_levels");
  }

  /** klassId → its levels, sorted by level: the last is the class's highest. */
  get klassLevelsByKlass(): Map<string, KlassLevel[]> {
    return (this.built.klassLevelsByKlass ??= this.rulesetData.resolvingIds(
      Map.groupBy(
        this.klassLevels.toSorted((a, b) => a.level - b.level),
        (kl) => kl.klassId,
      ),
    ));
  }

  /** klassLevelId → its granted spells joined with their rows: a link whose spell isn't in the view is left out. */
  get klassLevelSpellsWithSpellsByKlassLevel(): Map<
    string,
    (KlassLevelSpell & { spellsInRule: SpellWithAptitudes })[]
  > {
    const spells = this.rulesetData.storedById("spells");
    return (this.built.klassLevelSpellsWithSpellsByKlassLevel ??= this.rulesetData.resolvingIds(
      Map.groupBy(
        this.sortedKlassLevelSpells.flatMap((klp) => {
          const spell = spells.get(klp.spellId);
          return spell ? [{ ...klp, spellsInRule: spell }] : [];
        }),
        (joined) => joined.klassLevelId,
      ),
    ));
  }

  get klassSkills(): KlassSkill[] {
    return this.rulesetData.joinRows("class_skills");
  }

  /** klassId → its skills, the links themselves (`klassSkillsWithSkillsByKlass` joins the skills). */
  get klassSkillsByKlass(): Map<string, KlassSkill[]> {
    return (this.built.klassSkillsByKlass ??= this.rulesetData.resolvingIds(
      Map.groupBy(this.sortedKlassSkills, (ks) => ks.klassId),
    ));
  }

  /** klassId → its skills joined with their skills: a link whose skill isn't in the view is left out. */
  get klassSkillsWithSkillsByKlass(): Map<string, (KlassSkill & { skillsInRule: Skill })[]> {
    const skills = this.rulesetData.storedById("skills");
    return (this.built.klassSkillsWithSkillsByKlass ??= this.rulesetData.resolvingIds(
      Map.groupBy(
        this.sortedKlassSkills.flatMap((ks) => {
          const skill = skills.get(ks.skillId);
          return skill ? [{ ...ks, skillsInRule: skill }] : [];
        }),
        (joined) => joined.klassId,
      ),
    ));
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
      .filter((feat) => feat.featsAptitudesInRules.some((link) => link.aptitudeId === listId))
      .map((feat) => feat.id);
  }

  /** The ids of the ruleset's spells on a list, at a level when one is given (on any list when none is). */
  listSpellIds(where: { aptitudeId?: string; level?: number }): string[] {
    const listId = where.aptitudeId === undefined ? undefined : this.rulesetData.canonicalize(where.aptitudeId);
    return this.spells
      .filter((spell) =>
        spell.spellsAptitudesInRules.some(
          (link) =>
            (listId === undefined || link.aptitudeId === listId) && (where.level == null || link.level === where.level),
        ),
      )
      .map((spell) => spell.id);
  }

  get mechanics(): Mechanic[] {
    return this.rulesetData.rows("mechanics");
  }

  get mechanicsById(): Map<string, Mechanic> {
    return this.rulesetData.byId("mechanics");
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

  get spells(): SpellWithAptitudes[] {
    return this.rulesetData.rows("spells");
  }

  get spellsById(): Map<string, SpellWithAptitudes> {
    return this.rulesetData.byId("spells");
  }
}
