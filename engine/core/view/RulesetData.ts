import type { CowData } from "@/engine/core/cow/index.ts";
import type { PropertyOrder } from "@/engine/core/customizations/index.ts";
import type {
  Aptitude,
  FeatWithAptitudes,
  Item,
  Klass,
  KlassLevel,
  KlassLevelFeat,
  KlassLevelPower,
  KlassLevelSave,
  KlassSkill,
  Language,
  Mechanic,
  Modifier,
  PowerWithAptitudes,
  Property,
  Race,
  Requirement,
  Ruleset,
  RulesetAbility,
  RulesetSave,
  Skill,
} from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

/** Each index a ruleset's view builds on first read, and keeps. */
interface Indices {
  abilitiesById: Map<string, RulesetAbility>;
  aptitudeIdBySlug: Map<string, string>;
  aptitudeIdsByHavingPowers: Set<string>;
  aptitudesById: Map<string, Aptitude>;
  entityIdsByPropertyLookup: Map<string, string[]>;
  featIdBySlug: Map<string, string>;
  featsById: Map<string, FeatWithAptitudes>;
  itemsById: Map<string, Item>;
  klassesById: Map<string, Klass>;
  klassLevelByKlassAndLevel: Map<string, KlassLevel>;
  klassLevelFeatsByKlassLevel: Map<string, KlassLevelFeat[]>;
  klassLevelFeatsWithFeatsByKlassLevel: Map<string, (KlassLevelFeat & { featsInRule: FeatWithAptitudes })[]>;
  klassLevelPowersWithPowersByKlassLevel: Map<string, (KlassLevelPower & { powersInRule: PowerWithAptitudes })[]>;
  klassLevelSavesByKlassLevelId: Map<string, KlassLevelSave[]>;
  klassLevelsById: Map<string, KlassLevel>;
  klassLevelsByKlassId: Map<string, KlassLevel[]>;
  klassSkillsByKlassId: Map<string, KlassSkill[]>;
  klassSkillsWithSkillsByKlass: Map<string, (KlassSkill & { skillsInRule: Skill })[]>;
  languagesById: Map<string, Language>;
  mechanicsById: Map<string, Mechanic>;
  modifiersById: Map<string, Modifier>;
  modifiersBySource: Map<string, Modifier[]>;
  powerIdsBySlug: Map<string, string[]>;
  powersById: Map<string, PowerWithAptitudes>;
  propertiesByEntity: Map<string, Property[]>;
  propertiesByEntityType: Map<string, Property[]>;
  racesById: Map<string, Race>;
  requirementsByEntity: Map<string, Requirement[]>;
  savesById: Map<string, RulesetSave>;
  skillsById: Map<string, Skill>;
  /** A class's skills and a level's feats and powers by name, as the books list them; properties as stat blocks do. */
  sortedKlassLevelFeats: KlassLevelFeat[];
  sortedKlassLevelPowers: KlassLevelPower[];
  sortedKlassSkills: KlassSkill[];
  sortedProperties: Property[];
  /** The joins' lookups: by id, before the stored ids resolve. */
  storedFeatsById: Map<string, FeatWithAptitudes>;
  storedPowersById: Map<string, PowerWithAptitudes>;
  storedSkillsById: Map<string, Skill>;
}

/** A ruleset's lists, composed across its chain (`RulesetComposition`): what its view holds and indexes. */
export interface RulesetLists {
  abilities: RulesetAbility[];
  aptitudes: Aptitude[];
  feats: FeatWithAptitudes[];
  items: Item[];
  klasses: Klass[];
  klassLevelFeats: KlassLevelFeat[];
  klassLevelPowers: KlassLevelPower[];
  klassLevels: KlassLevel[];
  klassLevelSaves: KlassLevelSave[];
  klassSkills: KlassSkill[];
  languages: Language[];
  leveledAptitudeIds: Set<string>;
  mechanics: Mechanic[];
  modifiers: Modifier[];
  powers: PowerWithAptitudes[];
  properties: Property[];
  races: Race[];
  requirements: Requirement[];
  saves: RulesetSave[];
  skills: Skill[];
}

/** A ruleset as a character's build reads it: its row, and its view, composed by copy-on-write. */
export interface RulesetView {
  ruleset: Ruleset;
  rulesetData: RulesetData;
}

/** A ruleset's entities as its view has them, by their table: what `RulesetData.find` finds one of. */
export interface ViewEntities {
  abilities: RulesetAbility;
  aptitudes: Aptitude;
  feats: FeatWithAptitudes;
  items: Item;
  klass_levels: KlassLevel;
  klasses: Klass;
  languages: Language;
  mechanics: Mechanic;
  powers: PowerWithAptitudes;
  races: Race;
  saves: RulesetSave;
  skills: Skill;
}

/** Rows by id. */
function buildById<T extends { id: string }>(list: T[]): Map<string, T> {
  return new Map(list.map((item) => [item.id, item]));
}

/**
 * A ruleset's view: its lists, composed across its chain by its copy-on-write data (`RulesetComposition`), and their
 * lookup indices. An index is built the first time it's read, then kept: a request pays for the indices it reads, not
 * for all of them. Every id-keyed index takes a stored (pre-COW) id too: its `.get` and `.has` resolve the key
 * (`CowData.resolve`), so consumers don't thread `cow` through or call `canonicalize` on the common lookup path.
 */
export default class RulesetData {
  /** `propertyOrder`: the ruleset's order of an entity's properties, as its stat block shows them. */
  constructor(lists: RulesetLists, cow: CowData, propertyOrder: PropertyOrder) {
    this.abilities = lists.abilities;
    this.aptitudes = lists.aptitudes;
    this.feats = lists.feats;
    this.items = lists.items;
    this.klasses = lists.klasses;
    this.klassLevelFeats = lists.klassLevelFeats;
    this.klassLevelPowers = lists.klassLevelPowers;
    this.klassLevels = lists.klassLevels;
    this.klassLevelSaves = lists.klassLevelSaves;
    this.klassSkills = lists.klassSkills;
    this.languages = lists.languages;
    this.leveledAptitudeIds = lists.leveledAptitudeIds;
    this.mechanics = lists.mechanics;
    this.modifiers = lists.modifiers;
    this.powers = lists.powers;
    this.properties = lists.properties;
    this.races = lists.races;
    this.requirements = lists.requirements;
    this.saves = lists.saves;
    this.skills = lists.skills;
    this.cow = cow;
    this.propertyOrder = propertyOrder;
  }

  private readonly built: Partial<Indices> = {};

  private readonly klassLevelFeats: KlassLevelFeat[];

  private readonly klassLevelPowers: KlassLevelPower[];

  private readonly modifiers: Modifier[];

  private readonly properties: Property[];

  private readonly propertyOrder: PropertyOrder;

  private readonly requirements: Requirement[];

  readonly abilities: RulesetAbility[];

  readonly aptitudes: Aptitude[];

  /**
   * The ruleset's copy-on-write state: the id Maps resolve through it on their own; rows as stored (a character's, a
   * page's) are resolved with it (`resolveRows`), and lineage- or sibling-aware code reads it.
   */
  readonly cow: CowData;

  readonly feats: FeatWithAptitudes[];

  readonly items: Item[];

  readonly klasses: Klass[];

  readonly klassLevels: KlassLevel[];

  readonly klassLevelSaves: KlassLevelSave[];

  readonly klassSkills: KlassSkill[];

  readonly languages: Language[];

  readonly leveledAptitudeIds: Set<string>;

  readonly mechanics: Mechanic[];

  readonly powers: PowerWithAptitudes[];

  readonly races: Race[];

  readonly saves: RulesetSave[];

  readonly skills: Skill[];

  /**
   * Wraps a string-keyed Map so `.get(key)` and `.has(key)` look the key up as `resolveKey` maps it: consumers can pass
   * either a pre-COW (stored) id or a post-COW id — both land on the post-COW entity. `.size`, `.values()`,
   * `.entries()`, etc. behave normally (no alias duplication). Returns the original Map when the scope resolves no id
   * (no allocation cost).
   */
  private resolving<V>(map: Map<string, V>, resolveKey: (key: string) => string): Map<string, V> {
    if (this.cow.isEmpty()) return map;
    return new Proxy(map, {
      get(target, prop) {
        if (prop === "get") return (key: string) => target.get(resolveKey(key));

        if (prop === "has") return (key: string) => target.has(resolveKey(key));

        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  }

  /**
   * A Map keyed by `${id}:${rest}` composites (e.g. `klassLevelByKlassAndLevel`'s `${klassId}:${level}` keys): the id
   * portion before the first `:` resolves through `CowData.resolve`, the rest stays. So a caller passing a pre-COW
   * klassId still lands on the right klass level.
   */
  private resolvingCompositeKeys<V>(map: Map<string, V>): Map<string, V> {
    return this.resolving(map, (key) => {
      const sep = key.indexOf(":");
      if (sep === -1) return key;
      return this.cow.resolve(key.slice(0, sep)) + key.slice(sep);
    });
  }

  /** A Map keyed by entity ids, whose `.get` and `.has` take a stored (pre-COW) id. */
  private resolvingIds<V>(map: Map<string, V>): Map<string, V> {
    return this.resolving(map, (key) => this.cow.resolve(key));
  }

  /** A level's feats by name, as the books list them. */
  private get sortedKlassLevelFeats(): KlassLevelFeat[] {
    return (this.built.sortedKlassLevelFeats ??= this.klassLevelFeats.toSorted((a, b) =>
      (this.storedFeatsById.get(a.featId)?.name ?? "").localeCompare(this.storedFeatsById.get(b.featId)?.name ?? ""),
    ));
  }

  /** A level's powers by name, as the books list them. */
  private get sortedKlassLevelPowers(): KlassLevelPower[] {
    return (this.built.sortedKlassLevelPowers ??= this.klassLevelPowers.toSorted((a, b) =>
      (this.storedPowersById.get(a.powerId)?.name ?? "").localeCompare(
        this.storedPowersById.get(b.powerId)?.name ?? "",
      ),
    ));
  }

  /** A class's skills by name, as the books list them. */
  private get sortedKlassSkills(): KlassSkill[] {
    return (this.built.sortedKlassSkills ??= this.klassSkills.toSorted((a, b) =>
      (this.storedSkillsById.get(a.skillId)?.name ?? "").localeCompare(
        this.storedSkillsById.get(b.skillId)?.name ?? "",
      ),
    ));
  }

  /** Each entity's properties as its stat block shows them, whoever reads them. */
  private get sortedProperties(): Property[] {
    return (this.built.sortedProperties ??= this.propertyOrder.sort(this.properties));
  }

  private get storedFeatsById(): Map<string, FeatWithAptitudes> {
    return (this.built.storedFeatsById ??= buildById(this.feats));
  }

  private get storedPowersById(): Map<string, PowerWithAptitudes> {
    return (this.built.storedPowersById ??= buildById(this.powers));
  }

  private get storedSkillsById(): Map<string, Skill> {
    return (this.built.storedSkillsById ??= buildById(this.skills));
  }

  get abilitiesById(): Map<string, RulesetAbility> {
    return (this.built.abilitiesById ??= this.resolvingIds(buildById(this.abilities)));
  }

  /**
   * `stripSeparators(aptitude.name)` → aptitudeId: what modifier targets name an aptitude by (`aptitudes.<slug>.…`),
   * and what finalize, distribution, the pick queries and the loader map names through.
   */
  get aptitudeIdBySlug(): Map<string, string> {
    return (this.built.aptitudeIdBySlug ??= new Map(this.aptitudes.map((apt) => [stripSeparators(apt.name), apt.id])));
  }

  /** The aptitudes that have at least one power linked, from the powers' inline `powersAptitudesInRules` rows. */
  get aptitudeIdsByHavingPowers(): Set<string> {
    return (this.built.aptitudeIdsByHavingPowers ??= new Set(
      this.powers.flatMap((power) => power.powersAptitudesInRules.map((l) => l.aptitudeId)),
    ));
  }

  get aptitudesById(): Map<string, Aptitude> {
    return (this.built.aptitudesById ??= this.resolvingIds(buildById(this.aptitudes)));
  }

  /**
   * Resolve a stored (pre-COW) entity id to its post-COW form; the input unchanged if no copy stands for it. For
   * Set/array comparisons, where the id Maps' auto-resolving `.get`/`.has` doesn't apply.
   */
  canonicalize(id: string): string {
    return this.cow.resolve(id);
  }

  /** An entity's customizations, as the view composes them: its modifiers, its properties and its requirements. */
  customizationsOf(entityId: string) {
    return {
      modifiers: this.modifiersBySource.get(entityId) ?? [],
      properties: this.propertiesByEntity.get(entityId) ?? [],
      requirements: this.requirementsByEntity.get(entityId) ?? [],
    };
  }

  /**
   * Reverse property index: `${entityType}:${type}:${value}` → the ids of the entities with that property. Replaces
   * O(N) scans like `powers.filter(p => p.properties.some(x => x.type === TYPE && x.value === V))`.
   */
  get entityIdsByPropertyLookup(): Map<string, string[]> {
    if (this.built.entityIdsByPropertyLookup) return this.built.entityIdsByPropertyLookup;
    const entityIdsByPropertyLookup = new Map<string, string[]>();
    for (const p of this.properties) {
      const key = `${p.entityType}:${p.type}:${p.value}`;
      const group = entityIdsByPropertyLookup.get(key);
      if (group) group.push(p.entityId);
      else entityIdsByPropertyLookup.set(key, [p.entityId]);
    }
    return (this.built.entityIdsByPropertyLookup = entityIdsByPropertyLookup);
  }

  /** `stripSeparators(feat.name)` → featId, the first match winning: the "set feats.<slug>.possessed" modifier scan. */
  get featIdBySlug(): Map<string, string> {
    if (this.built.featIdBySlug) return this.built.featIdBySlug;
    const featIdBySlug = new Map<string, string>();
    for (const feat of this.feats) {
      const slug = stripSeparators(feat.name);
      if (!featIdBySlug.has(slug)) featIdBySlug.set(slug, feat.id);
    }
    return (this.built.featIdBySlug = featIdBySlug);
  }

  get featsById(): Map<string, FeatWithAptitudes> {
    return (this.built.featsById ??= this.resolvingIds(this.storedFeatsById));
  }

  /**
   * The entity of `type` an id names in the view (a stored id its copy or winner): the ruleset's own, or inherited. It
   * builds the index of `type` alone.
   */
  find<K extends keyof ViewEntities>(type: K, id: string): ViewEntities[K] | undefined {
    const byId: { [T in keyof ViewEntities]: () => ReadonlyMap<string, ViewEntities[T]> } = {
      abilities: () => this.abilitiesById,
      aptitudes: () => this.aptitudesById,
      feats: () => this.featsById,
      items: () => this.itemsById,
      klass_levels: () => this.klassLevelsById,
      klasses: () => this.klassesById,
      languages: () => this.languagesById,
      mechanics: () => this.mechanicsById,
      powers: () => this.powersById,
      races: () => this.racesById,
      saves: () => this.savesById,
      skills: () => this.skillsById,
    };
    return byId[type]().get(id);
  }

  /**
   * An item's properties: its template's of each type the item doesn't set, then its own. An item made from a
   * template (`sourceItemId`) holds only what it overrides, a type at a time: its own damage types replace all the
   * template's.
   */
  itemProperties(item: Pick<Item, "id" | "sourceItemId">): Property[] {
    const own = this.propertiesByEntity.get(item.id) ?? [];
    if (!item.sourceItemId) return [...own];
    const ownTypes = new Set(own.map((property) => property.type));
    const template = this.propertiesByEntity.get(item.sourceItemId) ?? [];
    return [...template.filter((property) => !ownTypes.has(property.type)), ...own];
  }

  get itemsById(): Map<string, Item> {
    return (this.built.itemsById ??= this.resolvingIds(buildById(this.items)));
  }

  get klassesById(): Map<string, Klass> {
    return (this.built.klassesById ??= this.resolvingIds(buildById(this.klasses)));
  }

  /** Key: `${klassId}:${level}`, the class's id resolved. */
  get klassLevelByKlassAndLevel(): Map<string, KlassLevel> {
    return (this.built.klassLevelByKlassAndLevel ??= this.resolvingCompositeKeys(
      new Map(this.klassLevels.map((kl) => [`${kl.klassId}:${kl.level}`, kl])),
    ));
  }

  /** klassLevelId → its granted feats, the links alone (`klassLevelFeatsWithFeatsByKlassLevel` joins the feats). */
  get klassLevelFeatsByKlassLevel(): Map<string, KlassLevelFeat[]> {
    return (this.built.klassLevelFeatsByKlassLevel ??= this.resolvingIds(
      Map.groupBy(this.sortedKlassLevelFeats, (klf) => klf.klassLevelId),
    ));
  }

  /** klassLevelId → its granted feats joined with their feats: a link whose feat isn't in the view is left out. */
  get klassLevelFeatsWithFeatsByKlassLevel(): Map<string, (KlassLevelFeat & { featsInRule: FeatWithAptitudes })[]> {
    return (this.built.klassLevelFeatsWithFeatsByKlassLevel ??= this.resolvingIds(
      Map.groupBy(
        this.sortedKlassLevelFeats.flatMap((klf) => {
          const feat = this.storedFeatsById.get(klf.featId);
          return feat ? [{ ...klf, featsInRule: feat }] : [];
        }),
        (joined) => joined.klassLevelId,
      ),
    ));
  }

  /** klassLevelId → its granted powers joined with their powers: a link whose power isn't in the view is left out. */
  get klassLevelPowersWithPowersByKlassLevel(): Map<
    string,
    (KlassLevelPower & { powersInRule: PowerWithAptitudes })[]
  > {
    return (this.built.klassLevelPowersWithPowersByKlassLevel ??= this.resolvingIds(
      Map.groupBy(
        this.sortedKlassLevelPowers.flatMap((klp) => {
          const power = this.storedPowersById.get(klp.powerId);
          return power ? [{ ...klp, powersInRule: power }] : [];
        }),
        (joined) => joined.klassLevelId,
      ),
    ));
  }

  get klassLevelSavesByKlassLevelId(): Map<string, KlassLevelSave[]> {
    return (this.built.klassLevelSavesByKlassLevelId ??= this.resolvingIds(
      Map.groupBy(this.klassLevelSaves, (kls) => kls.klassLevelId),
    ));
  }

  get klassLevelsById(): Map<string, KlassLevel> {
    return (this.built.klassLevelsById ??= this.resolvingIds(buildById(this.klassLevels)));
  }

  /** klassId → its levels, sorted by level: the last is the class's highest. */
  get klassLevelsByKlassId(): Map<string, KlassLevel[]> {
    if (this.built.klassLevelsByKlassId) return this.built.klassLevelsByKlassId;
    const klassLevelsByKlassId = Map.groupBy(this.klassLevels, (kl) => kl.klassId);
    for (const group of klassLevelsByKlassId.values()) group.sort((a, b) => a.level - b.level);
    return (this.built.klassLevelsByKlassId = this.resolvingIds(klassLevelsByKlassId));
  }

  /** klassId → its skills, the links themselves (`klassSkillsWithSkillsByKlass` joins the skills). */
  get klassSkillsByKlassId(): Map<string, KlassSkill[]> {
    return (this.built.klassSkillsByKlassId ??= this.resolvingIds(
      Map.groupBy(this.sortedKlassSkills, (ks) => ks.klassId),
    ));
  }

  /** klassId → its skills joined with their skills: a link whose skill isn't in the view is left out. */
  get klassSkillsWithSkillsByKlass(): Map<string, (KlassSkill & { skillsInRule: Skill })[]> {
    return (this.built.klassSkillsWithSkillsByKlass ??= this.resolvingIds(
      Map.groupBy(
        this.sortedKlassSkills.flatMap((ks) => {
          const skill = this.storedSkillsById.get(ks.skillId);
          return skill ? [{ ...ks, skillsInRule: skill }] : [];
        }),
        (joined) => joined.klassId,
      ),
    ));
  }

  get languagesById(): Map<string, Language> {
    return (this.built.languagesById ??= this.resolvingIds(buildById(this.languages)));
  }

  /**
   * The ids of the ruleset's feats on a list, as the ruleset composes it: a ruleset taking several books merges each
   * feat's copies and each list's, and the winning copy takes every copy's links, so a query of a list's feats takes
   * these ids, never the stored links.
   */
  listFeatIds(aptitudeId: string): string[] {
    const listId = this.canonicalize(aptitudeId);
    return this.feats
      .filter((feat) => feat.featsAptitudesInRules.some((link) => link.aptitudeId === listId))
      .map((feat) => feat.id);
  }

  /** The ids of the ruleset's spells on a list, at a level when one is given (on any list when none is). */
  listPowerIds(where: { aptitudeId?: string; level?: number }): string[] {
    const listId = where.aptitudeId === undefined ? undefined : this.canonicalize(where.aptitudeId);
    return this.powers
      .filter((power) =>
        power.powersAptitudesInRules.some(
          (link) =>
            (listId === undefined || link.aptitudeId === listId) && (where.level == null || link.level === where.level),
        ),
      )
      .map((power) => power.id);
  }

  get mechanicsById(): Map<string, Mechanic> {
    return (this.built.mechanicsById ??= this.resolvingIds(buildById(this.mechanics)));
  }

  get modifiersById(): Map<string, Modifier> {
    return (this.built.modifiersById ??= buildById(this.modifiers));
  }

  get modifiersBySource(): Map<string, Modifier[]> {
    return (this.built.modifiersBySource ??= this.resolvingIds(Map.groupBy(this.modifiers, (m) => m.sourceId)));
  }

  /**
   * `stripSeparators(power.name)` → powerIds (several powers can share a slug): the "set powers.<slug>.<apt>.known"
   * modifier scan. Resolve them through `powersById`, as `featIdBySlug` pairs with `featsById`.
   */
  get powerIdsBySlug(): Map<string, string[]> {
    return (this.built.powerIdsBySlug ??= new Map(
      [...Map.groupBy(this.powers, (power) => stripSeparators(power.name))].map(([slug, group]) => [
        slug,
        group.map((power) => power.id),
      ]),
    ));
  }

  get powersById(): Map<string, PowerWithAptitudes> {
    return (this.built.powersById ??= this.resolvingIds(this.storedPowersById));
  }

  get propertiesByEntity(): Map<string, Property[]> {
    return (this.built.propertiesByEntity ??= this.resolvingIds(Map.groupBy(this.sortedProperties, (p) => p.entityId)));
  }

  /** entityType → its properties across the chain (`"items"` → every item's): what TargetPaths groups properties by. */
  get propertiesByEntityType(): Map<string, Property[]> {
    return (this.built.propertiesByEntityType ??= Map.groupBy(this.sortedProperties, (p) => p.entityType));
  }

  get racesById(): Map<string, Race> {
    return (this.built.racesById ??= this.resolvingIds(buildById(this.races)));
  }

  /** entityId → its requirements (a sibling's merged into its winner's). */
  get requirementsByEntity(): Map<string, Requirement[]> {
    return (this.built.requirementsByEntity ??= this.resolvingIds(Map.groupBy(this.requirements, (r) => r.entityId)));
  }

  get savesById(): Map<string, RulesetSave> {
    return (this.built.savesById ??= this.resolvingIds(buildById(this.saves)));
  }

  get skillsById(): Map<string, Skill> {
    return (this.built.skillsById ??= this.resolvingIds(this.storedSkillsById));
  }
}
