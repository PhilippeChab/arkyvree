import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Db } from "@/server/database/index.ts";
import AbstractDetailedCharacter, {
  type DataLoader,
  type ValidationIssue,
} from "@/server/rulesets/AbstractDetailedCharacter.ts";
import DetailedCharacterSkills from "@/server/rulesets/dnd3.5/DetailedCharacterSkills.ts";
import type { SkillFlags } from "@/server/rulesets/hooks/index.ts";
import type {
  FeatWithPMR,
  Holders,
  InventoryEntry,
  KlassLevelWithPMR,
  PowerWithPMR,
  PreloadedCharacterData,
  PreloadedRulesetData,
} from "@/server/rulesets/types.ts";
import DetailedCharacterAbilities from "@/server/rulesets/universal/DetailedCharacterAbilities.ts";
import DetailedCharacterAptitudes from "@/server/rulesets/universal/DetailedCharacterAptitudes.ts";
import DetailedCharacterBonds from "@/server/rulesets/universal/DetailedCharacterBonds.ts";
import DetailedCharacterClasses from "@/server/rulesets/universal/DetailedCharacterClasses.ts";
import DetailedCharacterFeatGroupings from "@/server/rulesets/universal/DetailedCharacterFeatGroupings.ts";
import DetailedCharacterFeats from "@/server/rulesets/universal/DetailedCharacterFeats.ts";
import DetailedCharacterIdentity from "@/server/rulesets/universal/DetailedCharacterIdentity.ts";
import DetailedCharacterModifiers from "@/server/rulesets/universal/DetailedCharacterModifiers.ts";
import DetailedCharacterPowerGroupings from "@/server/rulesets/universal/DetailedCharacterPowerGroupings.ts";
import DetailedCharacterPowers from "@/server/rulesets/universal/DetailedCharacterPowers.ts";
import DetailedCharacterRequirements from "@/server/rulesets/universal/DetailedCharacterRequirements.ts";
import DetailedCharacterSavingThrows from "@/server/rulesets/universal/DetailedCharacterSavingThrows.ts";
import { FEAT_FAMILIES } from "@/shared/dnd3.5/feats.ts";
import {
  FEAT_FAMILY,
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

import DetailedCharacterArmors from "./DetailedCharacterArmors.ts";
import DetailedCharacterCombat from "./DetailedCharacterCombat.ts";
import DetailedCharacterDataLoader, { type Dnd35LoadedCharacterData } from "./DetailedCharacterDataLoader.ts";
import DetailedCharacterEncumbrance from "./DetailedCharacterEncumbrance.ts";
import DetailedCharacterInventory from "./DetailedCharacterInventory.ts";
import DetailedCharacterShields from "./DetailedCharacterShields.ts";
import DetailedCharacterSpellcasting from "./DetailedCharacterSpellcasting.ts";
import DetailedCharacterWeapons from "./DetailedCharacterWeapons.ts";
import { Dnd35LevelsHooks } from "./hooks/index.ts";
import TargetPaths from "./TargetPaths.ts";
import type { Dnd35ProjectedCharacterData } from "./types.ts";

export default class DetailedCharacter extends AbstractDetailedCharacter {
  constructor(character: Character) {
    super(character);

    // Universal sub-systems
    this.detailedCharacterClasses = new DetailedCharacterClasses();
    this.detailedCharacterAbilities = new DetailedCharacterAbilities();
    this.detailedCharacterFeats = new DetailedCharacterFeats();
    this.detailedCharacterFeatGroupings = new DetailedCharacterFeatGroupings(this.detailedCharacterFeats, [
      FEAT_FAMILY,
    ]);
    this.detailedCharacterPowers = new DetailedCharacterPowers();
    this.detailedCharacterPowerGroupings = new DetailedCharacterPowerGroupings(
      this.detailedCharacterPowers,
      this.detailedCharacterAbilities,
      [SPELL_SCHOOL, SPELL_DESCRIPTOR],
    );
    this.detailedCharacterSavingThrows = new DetailedCharacterSavingThrows(
      this.detailedCharacterAbilities,
      this.detailedCharacterClasses,
    );
    this.targetPaths = new TargetPaths();
    this.detailedCharacterModifiers = new DetailedCharacterModifiers(this.targetPaths);
    this.detailedCharacterRequirements = new DetailedCharacterRequirements(this.targetPaths);

    // Identity (universal)
    this.detailedCharacterIdentity = new DetailedCharacterIdentity(
      this.detailedCharacterAbilities,
      this.detailedCharacterClasses,
    );

    // Dnd3.5-specific sub-systems. Aptitude pools enumerate per-level slots up
    // to the ruleset's maxSpellLevel (3.5 caps at 9; other systems differ).
    this.detailedCharacterAptitudes = new DetailedCharacterAptitudes(
      this.detailedCharacterIdentity,
      this.detailedCharacterClasses,
      Dnd35LevelsHooks.MAX_SPELL_LEVEL,
    );
    this.detailedCharacterSkills = new DetailedCharacterSkills(
      this.detailedCharacterAbilities,
      this.detailedCharacterClasses,
    );
    this.detailedCharacterCombat = new DetailedCharacterCombat(
      this.detailedCharacterAbilities,
      this.detailedCharacterClasses,
    );
    this.detailedCharacterWeapons = new DetailedCharacterWeapons(this.detailedCharacterCombat);
    this.detailedCharacterArmors = new DetailedCharacterArmors(this.detailedCharacterCombat);
    this.detailedCharacterShields = new DetailedCharacterShields(this.detailedCharacterCombat);
    this.detailedCharacterEncumbrance = new DetailedCharacterEncumbrance(this.detailedCharacterAbilities);

    // Wire cross-dependencies
    this.detailedCharacterCombat.setArmorsData(this.detailedCharacterArmors.getArmors());
    this.detailedCharacterCombat.setShieldsData(this.detailedCharacterShields.getShields());
    this.detailedCharacterSkills.setArmorSources(this.detailedCharacterArmors, this.detailedCharacterShields);
    this.detailedCharacterSkills.setEncumbranceSource(this.detailedCharacterEncumbrance);
    this.detailedCharacterCombat.setSkills(this.detailedCharacterSkills);
    this.detailedCharacterCombat.setEncumbranceSource(this.detailedCharacterEncumbrance);
    this.detailedCharacterInventory = new DetailedCharacterInventory(
      this.detailedCharacterCombat,
      this.detailedCharacterWeapons,
      this.detailedCharacterArmors,
      this.detailedCharacterShields,
    );

    this.detailedCharacterSpellcasting = new DetailedCharacterSpellcasting(
      this.detailedCharacterClasses,
      this.detailedCharacterAbilities,
      this.detailedCharacterAptitudes,
      this.detailedCharacterPowers,
      this.detailedCharacterPowerGroupings,
      this.detailedCharacterModifiers,
    );

    this.detailedCharacterBonds = new DetailedCharacterBonds();
  }

  // ── Dnd3.5-specific sub-systems ─────────────────────────────────
  protected readonly detailedCharacterSkills: DetailedCharacterSkills;

  protected readonly detailedCharacterCombat: DetailedCharacterCombat;

  protected readonly detailedCharacterWeapons: DetailedCharacterWeapons;

  protected readonly detailedCharacterArmors: DetailedCharacterArmors;

  protected readonly detailedCharacterShields: DetailedCharacterShields;

  protected readonly detailedCharacterEncumbrance: DetailedCharacterEncumbrance;

  protected readonly detailedCharacterInventory: DetailedCharacterInventory;

  protected readonly detailedCharacterSpellcasting: DetailedCharacterSpellcasting;

  protected readonly detailedCharacterBonds: DetailedCharacterBonds;

  // ── Dnd3.5-specific data ────────────────────────────────────────
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

  protected buildHolders(): Holders {
    return {
      abilities: this.detailedCharacterAbilities,
      skills: this.detailedCharacterSkills,
      savingThrows: this.detailedCharacterSavingThrows,
      combat: this.detailedCharacterCombat,
      weapons: this.detailedCharacterWeapons,
      armors: this.detailedCharacterArmors,
      shields: this.detailedCharacterShields,
      classes: this.detailedCharacterClasses,
      feats: this.detailedCharacterFeats,
      inventory: this.detailedCharacterInventory,
      powers: this.detailedCharacterPowers,
      identity: this.detailedCharacterIdentity,
      aptitudes: this.detailedCharacterAptitudes,
      bonded: this.detailedCharacterBonds,
    };
  }

  protected applyLoadedData(data: Dnd35LoadedCharacterData) {
    super.applyLoadedData(data);
    this.skillPointAbilityId = data.skillPointAbilityId;
    this.skillProperties = data.skillProperties;
    this.klassLevelProperties = data.klassLevelProperties;
    this.klassBonusSpellAbilityMap = data.klassBonusSpellAbilityMap;
    this.klassCasterTypeMap = data.klassCasterTypeMap;
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
    const { available, spent, total } = this.detailedCharacterSkills.getSkillBudget();
    if (available > 0) {
      budget.push({ category: "skills", message: `${available} unspent skill point(s) (${spent}/${total})` });
    } else if (available < 0) {
      budget.push({
        category: "skills",
        message: `Overspent by ${Math.abs(available)} skill point(s) (${spent}/${total})`,
      });
    }
    const characterLevel = this.detailedCharacterIdentity.getIdentity().meta.level;
    const ranks = this.detailedCharacterSkills.getValidationIssues(characterLevel);
    return { budget, ranks };
  }

  /**
   * Whether the character has a feat with this property true (FEAT_WEAPON_FINESSE: Weapon Finesse): picked, granted or
   * given by a modifier.
   */
  protected hasFeatWith(rulesetData: CachedRulesetData, propertyType: string): boolean {
    return rulesetData.feats.some(
      (feat) =>
        (rulesetData.propertiesByEntity.get(feat.id) ?? []).some(
          (property) => property.type === propertyType && property.value === "true",
        ) &&
        (this.detailedCharacterFeats.getFeat(feat.name)?.possessed ?? false),
    );
  }

  protected createDataLoader(): DataLoader {
    return new DetailedCharacterDataLoader(this.character);
  }

  protected normalizeData(): void {
    this.detailedCharacterClasses.initialize(
      this.klasses,
      this.klassSkills,
      this.klassLevels,
      this.characterLevels,
      this.feats,
      this.skills,
      this.powers,
      this.rulesetKlasses,
    );
    this.detailedCharacterAbilities.initialize(this.characterAbilityScores, this.characterLevels);
    this.detailedCharacterIdentity.initialize(this.character, this.race, this.languages);
    this.detailedCharacterSkills.setSkillPointDependencies(
      this.rulesetAbilities,
      this.skillPointAbilityId,
      this.klassLevelProperties,
    );
    this.detailedCharacterAptitudes.initialize(
      this.rulesetAptitudes,
      this.klassLevelFeatCountsByAptitudeId,
      this.klassLevelPowerCountsByAptitudeId,
      this.leveledAptitudeIds,
    );
    this.detailedCharacterFeats.initialize(this.rulesetFeats, this.feats);
    // Every feat of a family, had or not, so a check of any of them reads the whole family
    const rulesetFeatsById = new Map(this.rulesetFeats.map((feat) => [feat.id, feat]));
    for (const prop of this.rulesetFeatProperties) {
      const feat = rulesetFeatsById.get(prop.entityId);
      if (feat) this.detailedCharacterFeatGroupings.registerFeat(feat, [prop]);
    }
    this.detailedCharacterFeatGroupings.seedEmptyFamilies(FEAT_FAMILIES);
    this.detailedCharacterFeats.injectGroupings(this.detailedCharacterFeatGroupings.getFeatGroupings());
    this.detailedCharacterSkills.initialize(
      this.rulesetSkills,
      this.rulesetAbilities,
      this.race.size,
      this.skillProperties,
    );
    this.detailedCharacterSavingThrows.initialize(this.rulesetSaves, this.rulesetAbilities, this.klassLevelSaves);
    this.detailedCharacterCombat.initialize(this.race, this.klassLevelProperties);
    this.detailedCharacterInventory.initialize(this.inventory);
    this.detailedCharacterEncumbrance.initialize(this.inventory, this.race);
    this.detailedCharacterPowers.initialize(this.powers, this.rulesetPowers, this.rulesetAptitudes);

    // Seed empty buckets for every school/descriptor in the ruleset so a
    // Spell Focus targeting a school the character has no spells in resolves
    // (zero matches → inactive) rather than failing path traversal (skipped).
    const groupingValues = new Set<string>();
    for (const prop of this.rulesetPowerProperties) {
      if (prop.type === SPELL_SCHOOL || prop.type === SPELL_DESCRIPTOR) {
        groupingValues.add(prop.value);
      }
    }
    this.detailedCharacterPowerGroupings.seedEmptyGroupings([...groupingValues]);

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
      this.detailedCharacterPowerGroupings.registerPower({ ...power, abilityDcName, aptitudeSlug }, power.properties);
    }
    this.detailedCharacterPowers.injectGroupings(this.detailedCharacterPowerGroupings.getPowerGroupings());

    this.detailedCharacterSkills.updateSkillPointTotals();
  }

  protected async postModifierProcessing(rulesetData: CachedRulesetData): Promise<void> {
    this.detailedCharacterSpellcasting.fetchBonusCasterLevelData(
      rulesetData,
      this.klassLevels,
      this.feats,
      this.characterLevels,
      this.rulesetKlasses,
    );
    this.detailedCharacterSpellcasting.applyBonusCasterLevelModifiers(this.holders!, this.feats);
    this.detailedCharacterSpellcasting.applyBonusSpellsFromAbilities(this.klassBonusSpellAbilityMap);
    this.detailedCharacterSpellcasting.computeSpellcasting(this.holders!, this.klassCasterTypeMap);
    this.detailedCharacterSpellcasting.fetchAptitudePowerData(rulesetData, this.powers);
    this.detailedCharacterSpellcasting.enrichAllKnownPowers(
      this.powers,
      this.klassLevels,
      this.rulesetAptitudes,
      this.klassBonusSpellAbilityMap,
    );
    this.detailedCharacterSpellcasting.buildSpellTags(this.feats, this.rulesetAptitudes);
  }

  protected postRequirementProcessing(): void {
    // A weapon's proficiency is its base item's requirements (`DetailedCharacterDataLoader`), apart from its others,
    // read of the item itself: a bastard sword's in two hands
    const unproficientItemIds = new Set(
      this.inventory
        .filter((inv) => inv.equipped && !this.areRequirementsMet([inv.item.proficiency], { sourceId: inv.item.id }))
        .map((inv) => inv.item.id),
    );
    this.detailedCharacterCombat.applyProficiencyPenalties(unproficientItemIds);
  }

  protected async preRequirementProcessing(rulesetData: CachedRulesetData): Promise<void> {
    this.detailedCharacterSpellcasting.initSpellcastingHolder(this.holders!, this.modifiers, this.klassCasterTypeMap);
    // Possession modifiers have given their feats: a finessed weapon's attack is what requirements read
    this.detailedCharacterCombat.applyWeaponFinesse(this.hasFeatWith(rulesetData, FEAT_WEAPON_FINESSE));
    this.detailedCharacterCombat.applyOversizedTwoWeaponFighting(
      this.hasFeatWith(rulesetData, FEAT_OVERSIZED_TWO_WEAPON_FIGHTING),
    );
  }

  async build(
    database?: Db,
    projectedData?: Dnd35ProjectedCharacterData,
    preloaded?: PreloadedCharacterData | PreloadedRulesetData,
  ) {
    await super.build(database, projectedData, preloaded);
  }

  getDetailedCharacterArmors() {
    return this.detailedCharacterArmors;
  }

  getDetailedCharacterBonds() {
    return this.detailedCharacterBonds;
  }

  getDetailedCharacterCombat() {
    return this.detailedCharacterCombat;
  }

  getDetailedCharacterEncumbrance() {
    return this.detailedCharacterEncumbrance;
  }

  getDetailedCharacterInventory() {
    return this.detailedCharacterInventory;
  }

  getDetailedCharacterSavingThrows() {
    return this.detailedCharacterSavingThrows;
  }

  getDetailedCharacterShields() {
    return this.detailedCharacterShields;
  }

  getDetailedCharacterSkills() {
    return this.detailedCharacterSkills;
  }

  getDetailedCharacterWeapons() {
    return this.detailedCharacterWeapons;
  }

  getSpellTags() {
    return this.detailedCharacterSpellcasting.getSpellTags();
  }

  getSpellcasting(): { arcane: number; divine: number } {
    const holder = this.holders?.["spellcasting"];
    return holder ? holder.getSpellcasting() : { arcane: 0, divine: 0 };
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
      const dc = this.detailedCharacterPowers.getPower(virtual.name)?.dc?.[aptitudeSlug]?.total ?? null;
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
          this.detailedCharacterSpellcasting.getBonusKlassLevelModifiers().find((m) => m.id === entityId);
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
        const attribution = this.detailedCharacterSpellcasting.getBonusKlassLevelAttribution().get(entityId);
        if (attribution) return attribution;
        const bonusKl = this.detailedCharacterSpellcasting.getBonusKlassLevels().find((k) => k.id === entityId);
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

  evaluateWithProjectedLevel(
    klassName: string,
    klassLevel: KlassLevel,
    characterLevel: CharacterLevel,
    requirementGroups: Requirement[][],
  ): boolean {
    this.detailedCharacterClasses.addProjectedLevel(klassName, klassLevel, characterLevel);
    const result = this.areRequirementsMet(requirementGroups);
    this.detailedCharacterClasses.removeProjectedLevel(klassName);
    return result;
  }
}
