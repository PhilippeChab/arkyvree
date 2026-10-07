import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";
import AbstractDetailedCharacter, {
  type DataLoader,
  type ValidationIssue,
} from "@/server/rulesets/dnd3.5/character/AbstractDetailedCharacter.ts";
import { buildComponents, type Dnd35Components } from "@/server/rulesets/dnd3.5/character/components.ts";
import TargetPaths from "@/server/rulesets/dnd3.5/Dnd35TargetPaths.ts";
import { Dnd35LevelsRules } from "@/server/rulesets/dnd3.5/levels/Dnd35LevelsRules.ts";
import DetailedCharacterDataLoader, {
  type Dnd35LoadedCharacterData,
} from "@/server/rulesets/dnd3.5/loading/DetailedCharacterDataLoader.ts";
import type { Dnd35ProjectedCharacterData } from "@/server/rulesets/dnd3.5/types.ts";
import ModifierEvaluator from "@/server/rulesets/engine/modifiers/ModifierEvaluator.ts";
import type { SkillFlags } from "@/server/rulesets/engine/module/index.ts";
import RequirementEvaluator from "@/server/rulesets/engine/requirements/RequirementEvaluator.ts";
import type {
  FeatWithPMR,
  InventoryEntry,
  KlassLevelWithPMR,
  PowerWithPMR,
  PreloadedCharacterData,
  PreloadedRulesetData,
} from "@/server/rulesets/engine/types.ts";
import { FEAT_FAMILIES } from "@/shared/dnd3.5/feats.ts";
import {
  FEAT_OVERSIZED_TWO_WEAPON_FIGHTING,
  FEAT_WEAPON_FINESSE,
  SPELL_DESCRIPTOR,
  SPELL_SCHOOL,
} from "@/shared/dnd3.5/properties/index.ts";
import { toSpellPossessionSlug } from "@/shared/dnd3.5/spells.ts";
import type {
  Character,
  CharacterLevel,
  Klass,
  KlassLevel,
  Modifier,
  PowerWithAptitudes,
  Property,
  Requirement,
} from "@/shared/relations.ts";

export default class DetailedCharacter extends AbstractDetailedCharacter {
  constructor(character: Character) {
    super(character);
    this.targetPaths = new TargetPaths();
    this.modifierEvaluator = new ModifierEvaluator(this.targetPaths, this.sourcesOf);
    this.requirementEvaluator = new RequirementEvaluator(this.targetPaths);
    this.components = buildComponents(this.modifierEvaluator, (totalLevel) => this.countGeneralFeats(totalLevel));
  }

  readonly components: Dnd35Components;

  readonly modifierEvaluator: ModifierEvaluator;

  readonly requirementEvaluator: RequirementEvaluator;

  // Dnd3.5-specific data
  protected skillPointAbilityId: string | null = null;

  protected skillProperties: Map<string, SkillFlags> = new Map();

  protected klassLevelProperties: Map<string, { bab: number; skills: number }> = new Map();

  protected klassBonusSpellAbilityMap = new Map<string, string>();

  protected klassCasterTypeMap = new Map<string, "Arcane" | "Divine">();

  // Diagnostic helpers (resolveEntityName / resolveModifierSourceName) run
  // per unmet-requirement when formatting validation errors. Build lookup
  // maps once on first use and reuse across subsequent resolve calls.
  // The index is cached for the lifetime of the DetailedCharacter instance;
  // it relies on `feats` / `powers` / `inventory` / `klassLevels` / `race`
  // / `rulesetKlasses` being immutable after `build()` returns. If any
  // future code mutates those post-build, invalidate this field first.
  private diagnosticsIndex?: {
    featsById: Map<string, FeatWithPMR>;
    powersById: Map<string, PowerWithPMR>;
    klassLevelsById: Map<string, KlassLevelWithPMR>;
    rulesetKlassesById: Map<string, Klass>;
    inventoryByItemId: Map<string, InventoryEntry>;
    modifierOwner: Map<string, { name: string; type: string }>;
  };

  protected applyLoadedData(data: Dnd35LoadedCharacterData) {
    super.applyLoadedData(data);
    this.skillPointAbilityId = data.skillPointAbilityId;
    this.skillProperties = data.skillProperties;
    this.klassLevelProperties = data.klassLevelProperties;
    this.klassBonusSpellAbilityMap = data.klassBonusSpellAbilityMap;
    this.klassCasterTypeMap = data.klassCasterTypeMap;
  }

  /** The general feats the character has at its total level (`Dnd35LevelsRules.countGeneralFeats`). */
  protected countGeneralFeats(totalLevel: number): number {
    return Dnd35LevelsRules.countGeneralFeats(totalLevel);
  }

  protected createDataLoader(): DataLoader {
    return new DetailedCharacterDataLoader(this.character);
  }

  private getDiagnosticsIndex() {
    if (this.diagnosticsIndex) return this.diagnosticsIndex;
    const featsById = new Map<string, FeatWithPMR>();
    for (const f of this.feats) featsById.set(f.id, f);
    const powersById = new Map<string, PowerWithPMR>();
    for (const p of this.powers) powersById.set(p.id, p);
    const klassLevelsById = new Map<string, KlassLevelWithPMR>();
    for (const kl of this.klassLevels) klassLevelsById.set(kl.id, kl);
    const rulesetKlassesById = new Map<string, Klass>();
    for (const k of this.rulesetKlasses) rulesetKlassesById.set(k.id, k);
    const inventoryByItemId = new Map<string, InventoryEntry>();
    for (const inv of this.inventory) {
      inventoryByItemId.set(inv.item.id, inv);
      if (inv.item.sourceItemId) inventoryByItemId.set(inv.item.sourceItemId, inv);
    }

    // Flat modifier.id → owning entity index. Built once by iterating every
    // entity that owns modifiers so resolveModifierSourceName becomes O(1).
    const modifierOwner = new Map<string, { name: string; type: string }>();
    for (const feat of this.feats) {
      for (const m of feat.modifiers) modifierOwner.set(m.id, { name: feat.name, type: "feats" });
    }
    for (const inv of this.inventory) {
      for (const m of inv.item.modifiers) modifierOwner.set(m.id, { name: inv.item.name, type: "items" });
    }
    if (this.race?.modifiers) {
      for (const m of this.race.modifiers) modifierOwner.set(m.id, { name: this.race.name, type: "races" });
    }
    for (const kl of this.klassLevels) {
      const klass = rulesetKlassesById.get(kl.klassId);
      const label = klass ? `${klass.name} Level ${kl.level}` : `Level ${kl.level}`;
      for (const m of kl.modifiers) modifierOwner.set(m.id, { name: label, type: "klass_levels" });
    }
    for (const power of this.powers) {
      for (const m of power.modifiers) modifierOwner.set(m.id, { name: power.name, type: "powers" });
    }

    this.diagnosticsIndex = {
      featsById,
      powersById,
      klassLevelsById,
      rulesetKlassesById,
      inventoryByItemId,
      modifierOwner,
    };
    return this.diagnosticsIndex;
  }

  protected getSkillValidationIssues(): { budget: ValidationIssue[]; ranks: ValidationIssue[] } {
    const budget: ValidationIssue[] = [];
    const { available, spent, total } = this.components.skills.getSkillBudget();
    if (available > 0) {
      budget.push({ category: "skills", message: `${available} unspent skill point(s) (${spent}/${total})` });
    } else if (available < 0) {
      budget.push({
        category: "skills",
        message: `Overspent by ${Math.abs(available)} skill point(s) (${spent}/${total})`,
      });
    }
    const characterLevel = this.components.identity.getIdentity().meta.level;
    const ranks = this.components.skills.getValidationIssues(characterLevel);
    return { budget, ranks };
  }

  /**
   * Whether the character has a feat with this property true (FEAT_WEAPON_FINESSE: Weapon Finesse): picked, granted or
   * given by a modifier.
   */
  protected hasFeatWith(rulesetData: RulesetData, propertyType: string): boolean {
    return rulesetData.feats.some(
      (feat) =>
        (rulesetData.propertiesByEntity.get(feat.id) ?? []).some(
          (property) => property.type === propertyType && property.value === "true",
        ) &&
        (this.components.feats.getFeat(feat.name)?.possessed ?? false),
    );
  }

  protected normalizeData(): void {
    this.components.classes.initialize(
      this.klasses,
      this.klassSkills,
      this.klassLevels,
      this.characterLevels,
      this.feats,
      this.skills,
      this.powers,
      this.rulesetKlasses,
    );
    this.components.abilities.initialize(this.characterAbilityScores, this.characterLevels);
    this.components.identity.initialize(this.character, this.race, this.languages);
    this.components.skills.setSkillPointDependencies(
      this.rulesetAbilities,
      this.skillPointAbilityId,
      this.klassLevelProperties,
    );
    this.components.aptitudes.initialize(
      this.rulesetAptitudes,
      this.klassLevelFeatCountsByAptitudeId,
      this.klassLevelPowerCountsByAptitudeId,
      this.leveledAptitudeIds,
    );
    this.components.feats.initialize(this.rulesetFeats, this.feats);
    // Every feat of a family, had or not, so a check of any of them reads the whole family
    const rulesetFeatsById = new Map(this.rulesetFeats.map((feat) => [feat.id, feat]));
    for (const prop of this.rulesetFeatProperties) {
      const feat = rulesetFeatsById.get(prop.entityId);
      if (feat) this.components.featGroupings.registerFeat(feat, [prop]);
    }
    this.components.featGroupings.seedEmptyFamilies(FEAT_FAMILIES);
    this.components.feats.injectGroupings(this.components.featGroupings.getFeatGroupings());
    this.components.skills.initialize(this.rulesetSkills, this.rulesetAbilities, this.race.size, this.skillProperties);
    this.components.savingThrows.initialize(this.rulesetSaves, this.rulesetAbilities, this.klassLevelSaves);
    this.components.combat.initialize(this.race, this.klassLevelProperties);
    this.components.inventory.initialize(this.inventory);
    this.components.encumbrance.initialize(this.inventory, this.race);
    this.components.powers.initialize(this.powers, this.rulesetPowers, this.rulesetAptitudes, this.featListIds);

    // Seed empty buckets for every school/descriptor in the ruleset so a
    // Spell Focus targeting a school the character has no spells in resolves
    // (zero matches → inactive) rather than failing path traversal (skipped).
    const groupingValues = new Set<string>();
    for (const prop of this.rulesetPowerProperties) {
      if (prop.type === SPELL_SCHOOL || prop.type === SPELL_DESCRIPTOR) {
        groupingValues.add(prop.value);
      }
    }
    this.components.powerGroupings.seedEmptyGroupings([...groupingValues]);

    // Build aptitudeId → DC ability lookup from real spells once so virtual
    // spells (granted via `set powers.X.Y.known`) — which carry no klass
    // level pointer — can resolve their DC ability via their aptitudeId.
    const aptitudeIdToAbilityName = new Map<string, string>();
    for (const power of this.powers) {
      if (power.virtual) continue;
      const klassLevel = this.klassLevels.find((kl) => kl.id === power.klassLevelId);
      if (!klassLevel) continue;
      const abilityName = this.klassBonusSpellAbilityMap.get(klassLevel.klassId);
      if (abilityName) aptitudeIdToAbilityName.set(power.aptitudeId, abilityName);
    }

    // Each class casts a spell with its DC: keyed by the class's aptitude, as the spell's known flags are
    const aptitudeSlugById = new Map(this.rulesetAptitudes.map((apt) => [apt.id, toSpellPossessionSlug(apt.name)]));
    for (const power of this.powers) {
      let abilityDcName: string | null = null;
      if (power.virtual) {
        abilityDcName = aptitudeIdToAbilityName.get(power.aptitudeId) ?? null;
      } else {
        const klassLevel = this.klassLevels.find((kl) => kl.id === power.klassLevelId);
        if (klassLevel) {
          abilityDcName = this.klassBonusSpellAbilityMap.get(klassLevel.klassId) ?? null;
        }
      }
      const aptitudeSlug = aptitudeSlugById.get(power.aptitudeId) ?? power.aptitudeId;
      this.components.powerGroupings.registerPower({ ...power, abilityDcName, aptitudeSlug }, power.properties);
    }
    this.components.powers.injectGroupings(this.components.powerGroupings.getPowerGroupings());

    this.components.skills.updateSkillPointTotals();
  }

  protected postRequirementProcessing(): void {
    // A weapon's proficiency is its base item's requirements (`DetailedCharacterDataLoader`), apart from its others,
    // read of the entry holding it: a bastard sword's in the hands it's in, each of an item's entries alone
    const unproficient = this.inventory
      .filter((inv) => inv.equipped && !this.areRequirementsMet([inv.item.proficiency], { sourceId: inv.id }))
      .map((inv) => ({ id: inv.id, itemId: inv.item.id }));
    this.components.combat.applyProficiencyPenalties(unproficient);
  }

  protected async postModifierProcessing(rulesetData: RulesetData): Promise<void> {
    this.components.spellcasting.fetchBonusCasterLevelData(
      rulesetData,
      this.klassLevels,
      this.feats,
      this.characterLevels,
      this.rulesetKlasses,
    );
    this.components.spellcasting.applyBonusCasterLevelModifiers(
      this.components!,
      this.feats,
      this.featListIds,
      // A target counted as met reads as one any value meets: a class's level gate, which its spell levels replace
      (modifier, metTargets = []) =>
        this.areRequirementsMet([
          (rulesetData.requirementsByEntity.get(modifier.id) ?? []).map((requirement) =>
            requirement.target && metTargets.includes(requirement.target)
              ? { ...requirement, operator: "greater_than_or_equal", value: "0", valueType: "number" }
              : requirement,
          ),
        ]),
    );
    this.components.spellcasting.applyBonusSpellsFromAbilities(this.klassBonusSpellAbilityMap);
    this.components.spellcasting.computeSpellcasting(this.klassCasterTypeMap);
    this.components.spellcasting.fetchAptitudePowerData(rulesetData, this.powers);
    this.components.spellcasting.enrichAllKnownPowers(
      this.powers,
      this.klassLevels,
      this.rulesetAptitudes,
      this.klassBonusSpellAbilityMap,
    );
    this.components.spellcasting.buildSpellTags(this.feats, this.featListIds);
  }

  protected async preRequirementProcessing(rulesetData: RulesetData): Promise<void> {
    this.components.spellcasting.loadClassLists(rulesetData);
    this.components.spellcasting.initCasterLevels(this.modifiers, this.klassCasterTypeMap);
    // Possession modifiers have given their feats: a finessed weapon's attack is what requirements read
    this.components.combat.applyWeaponFinesse(this.hasFeatWith(rulesetData, FEAT_WEAPON_FINESSE));
    this.components.combat.applyOversizedTwoWeaponFighting(
      this.hasFeatWith(rulesetData, FEAT_OVERSIZED_TWO_WEAPON_FIGHTING),
    );
  }

  evaluateWithProjectedLevel(
    klassName: string,
    klassLevel: KlassLevel,
    characterLevel: CharacterLevel,
    requirementGroups: Requirement[][],
  ): boolean {
    this.components.classes.addProjectedLevel(klassName, klassLevel, characterLevel);
    const result = this.areRequirementsMet(requirementGroups);
    this.components.classes.removeProjectedLevel(klassName);
    return result;
  }

  getSpellcasting(): { arcane: number; divine: number } {
    return this.components.spellcasting.getSpellcasting();
  }

  getSpellTagLists() {
    return this.components.spellcasting.getSpellTagLists();
  }

  getSpellTags() {
    return this.components.spellcasting.getSpellTags();
  }

  getVirtuallyPossessedPowerIds() {
    return this.powers.filter((p) => p.virtual).map((p) => p.id);
  }

  /**
   * Virtually possessed spells (granted via `set powers.<slug>.<apt>.known`
   * modifiers). Now that virtuals live in `this.powers` they go through
   * `registerPower` like real spells, so DC reflects grouping bonuses
   * (Spell Focus, etc.) without a separate registration pass.
   */
  getVirtuallyPossessedPowersWithAptitudes() {
    const saveIdToName = new Map<string, string>();
    for (const save of this.rulesetSaves) saveIdToName.set(save.id, save.name);

    const powerById = new Map<string, PowerWithAptitudes>();
    for (const power of this.rulesetPowers) powerById.set(power.id, power);

    const results: {
      power: PowerWithAptitudes;
      aptitudeId: string;
      level: number;
      properties: Property[];
      dc: number | null;
      saveName: string | null;
    }[] = [];
    for (const virtual of this.powers) {
      if (!virtual.virtual) continue;
      const fullPower = powerById.get(virtual.id);
      if (!fullPower) continue;
      const level = virtual.powerLevel;
      if (level == null) continue;
      const aptitude = this.rulesetAptitudes.find((apt) => apt.id === virtual.aptitudeId);
      const aptitudeSlug = aptitude ? toSpellPossessionSlug(aptitude.name) : virtual.aptitudeId;
      const dc = this.components.powers.getPower(virtual.name)?.dc?.[aptitudeSlug]?.total ?? null;
      const saveName = fullPower.saveId ? (saveIdToName.get(fullPower.saveId) ?? null) : null;
      results.push({
        power: fullPower,
        aptitudeId: virtual.aptitudeId,
        level,
        properties: virtual.properties,
        dc,
        saveName,
      });
    }
    return results;
  }

  resolveEntityName(entityId: string, entityType: string): string | undefined {
    const idx = this.getDiagnosticsIndex();
    switch (entityType) {
      case "races":
        if (this.race?.id === entityId) return this.race.name;
        break;
      case "feats":
        return idx.featsById.get(entityId)?.name;
      case "powers":
        return idx.powersById.get(entityId)?.name;
      case "items":
        return idx.inventoryByItemId.get(entityId)?.item.name;
      case "klasses":
        return idx.rulesetKlassesById.get(entityId)?.name;
      case "modifiers": {
        const mod =
          this.modifiers.find((m) => m.id === entityId) ??
          this.components.spellcasting.getBonusKlassLevelModifiers().find((m) => m.id === entityId);
        if (mod) {
          return this.resolveEntityName(mod.sourceId, mod.sourceType);
        }
        break;
      }
      case "characters":
        if (this.character.id === entityId) return this.character.name;
        break;
      case "klass_levels": {
        const kl = idx.klassLevelsById.get(entityId);
        if (kl) {
          const klass = idx.rulesetKlassesById.get(kl.klassId);
          return klass ? `${klass.name} Level ${kl.level}` : `Level ${kl.level}`;
        }
        const attribution = this.components.spellcasting.getBonusKlassLevelAttribution().get(entityId);
        if (attribution) return attribution;
        const bonusKl = this.components.spellcasting.getBonusKlassLevels().find((k) => k.id === entityId);
        if (bonusKl) {
          const klass = idx.rulesetKlassesById.get(bonusKl.klassId);
          return klass ? `${klass.name} Level ${bonusKl.level} (bonus)` : `Level ${bonusKl.level} (bonus)`;
        }
        break;
      }
    }
    return undefined;
  }

  resolveModifierSourceName(modifier: Modifier): { name: string; type: string } | undefined {
    const name = this.resolveEntityName(modifier.sourceId, modifier.sourceType);
    if (name) return { name, type: modifier.sourceType };
    return this.getDiagnosticsIndex().modifierOwner.get(modifier.id);
  }

  override validate() {
    const baseResult = super.validate();
    const { budget: skillBudgetIssues, ranks: skillRankIssues } = this.getSkillValidationIssues();

    // Insert skill issues after aptitude issues to preserve original ordering
    const aptitudeEndIndex = baseResult.issues.findLastIndex((i) => i.category === "aptitudes") + 1;
    const issues = [
      ...baseResult.issues.slice(0, aptitudeEndIndex),
      ...skillBudgetIssues,
      ...skillRankIssues,
      ...baseResult.issues.slice(aptitudeEndIndex),
    ];
    return { valid: issues.length === 0, issues };
  }

  async build(
    database?: Db,
    projectedData?: Dnd35ProjectedCharacterData,
    preloaded?: PreloadedCharacterData | PreloadedRulesetData,
  ) {
    await super.build(database, projectedData, preloaded);
  }
}
