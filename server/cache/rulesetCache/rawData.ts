import { db } from "@/server/database/index.ts";
import {
  Abilities,
  Aptitudes,
  Feats,
  fetchEveryPage,
  Items,
  Klasses,
  KlassLevelFeats,
  KlassLevelPowers,
  KlassLevels,
  KlassLevelSaves,
  KlassSkills,
  Languages,
  Mechanics,
  Modifiers,
  Powers,
  Properties,
  Races,
  Requirements,
  Rulesets,
  Saves,
  Skills,
} from "@/server/repositories/index.ts";
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
  RulesetAbility,
  RulesetSave,
  Skill,
} from "@/shared/relations.ts";

type RawEntities = Pick<
  RulesetRawData,
  | "abilities"
  | "saves"
  | "skills"
  | "feats"
  | "powers"
  | "aptitudes"
  | "klasses"
  | "races"
  | "languages"
  | "items"
  | "mechanics"
>;

export interface RulesetRawData {
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
  /** Every modifier whose source is an entity in this ruleset — all sourceTypes. */
  modifiers: Modifier[];
  powers: PowerWithAptitudes[];
  /** Every property row owned by this ruleset — all entityTypes. Consumers filter. */
  properties: Property[];
  races: Race[];
  /** Every requirement row in this ruleset, including those attached to modifiers. */
  requirements: Requirement[];
  saves: RulesetSave[];
  skills: Skill[];
}

/**
 * Rounds 3 and 4: the customizations and the klass-level sub-tables. Customizations include everything keyed on
 * entities (feats, powers, …), ruleset-level properties, and klass-level rows (KLASS_LEVEL_BAB,
 * KLASS_LEVEL_SKILL_POINTS, class-feature modifiers, etc.). Requirements come last: they need the modifier IDs for
 * entityType='modifiers' lookups.
 */
async function fetchCustomizations(rulesetId: string, entities: RawEntities, klassLevelIds: string[]) {
  const customizationEntityIds = [
    ...entities.abilities.map((a) => a.id),
    ...entities.saves.map((s) => s.id),
    ...entities.skills.map((s) => s.id),
    ...entities.feats.map((f) => f.id),
    ...entities.powers.map((p) => p.id),
    ...entities.aptitudes.map((a) => a.id),
    ...entities.klasses.map((k) => k.id),
    ...entities.races.map((r) => r.id),
    ...entities.languages.map((l) => l.id),
    ...entities.items.map((i) => i.id),
    ...entities.mechanics.map((m) => m.id),
    ...klassLevelIds,
  ];
  const propertyEntityIds = [...customizationEntityIds, rulesetId];
  const [properties, modifiers, klassLevelFeats, klassLevelPowers, klassLevelSaves] = await Promise.all([
    Properties.findMany(db, { entityIds: propertyEntityIds }),
    Modifiers.findMany(db, { sourceIds: customizationEntityIds }),
    KlassLevelFeats.findMany(db, { klassLevelIds }),
    KlassLevelPowers.findMany(db, { klassLevelIds }),
    KlassLevelSaves.findMany(db, { klassLevelIds }),
  ]);

  const requirements = await Requirements.findMany(db, {
    entityIds: [...customizationEntityIds, ...modifiers.map((m) => m.id)],
  });
  return { properties, modifiers, klassLevelFeats, klassLevelPowers, klassLevelSaves, requirements };
}

/**
 * A ruleset's own rows (a campaign's, with one), none of its ancestors', and whether to pin them: a system ruleset's,
 * which every fork reads. For the cache (`RulesetCache.getRawData`), which reads them once.
 */
export async function fetchRulesetRawData(
  rulesetId: string,
  campaignId?: string,
): Promise<{ data: RulesetRawData; pinned: boolean }> {
  const filters = campaignId
    ? { rulesetId, campaignId, ancestorRulesetIds: [] }
    : { rulesetId, ancestorRulesetIds: [] };

  // Round 1: fetch entities + ruleset metadata (for pin decision) in parallel.
  const [abilities, saves, skills, feats, powers, aptitudes, klasses, races, languages, items, mechanics, ruleset] =
    await Promise.all([
      fetchEveryPage((pagination) => Abilities.findPage(db, filters, pagination)),
      fetchEveryPage((pagination) => Saves.findPage(db, filters, pagination)),
      fetchEveryPage((pagination) => Skills.findPage(db, filters, pagination)),
      fetchEveryPage((pagination) => Feats.findPage(db, filters, pagination)),
      fetchEveryPage((pagination) => Powers.findPage(db, filters, pagination)),
      fetchEveryPage((pagination) => Aptitudes.findPage(db, filters, pagination)),
      fetchEveryPage((pagination) => Klasses.findPage(db, filters, pagination)),
      fetchEveryPage((pagination) => Races.findPage(db, filters, pagination)),
      fetchEveryPage((pagination) => Languages.findPage(db, filters, pagination)),
      fetchEveryPage((pagination) => Items.findPage(db, filters, pagination)),
      fetchEveryPage((pagination) => Mechanics.findPage(db, filters, pagination)),
      campaignId ? Promise.resolve(null) : Rulesets.findOne(db, { id: rulesetId }),
    ]);
  const entities = { abilities, saves, skills, feats, powers, aptitudes, klasses, races, languages, items, mechanics };

  // Round 2: klass sub-tables + leveled aptitudes (need klassIds / aptitudeIds). Customizations wait until round 3 —
  // they need klass-level IDs to pick up properties/modifiers/requirements attached to class-level rows.
  const klassIds = klasses.map((k) => k.id);
  const [klassLevels, klassSkills, leveledAptitudeIds] = await Promise.all([
    KlassLevels.findMany(db, { klassIds }),
    KlassSkills.findMany(db, { klassIds }),
    Aptitudes.findLeveledIds(db, { aptitudeIds: aptitudes.map((a) => a.id) }),
  ]);
  const customizations = await fetchCustomizations(
    rulesetId,
    entities,
    klassLevels.map((kl) => kl.id),
  );
  const data: RulesetRawData = { ...entities, klassLevels, klassSkills, leveledAptitudeIds, ...customizations };

  // Pin system-seeded rulesets (bases + extensions) BEFORE writing so the pin flag
  // is in place for the entry's whole lifetime — no window where eviction pressure
  // could knock it out. We use the `system` column rather than `userId IS NULL` so
  // orphaned user forks (userId nulled out by `Rulesets.orphan`) can't accidentally slip
  // into the pinned set. Only the non-campaign entry is eligible (system rulesets
  // are not campaign-scoped).
  return { data, pinned: !!ruleset?.system };
}
