import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import type { Holders } from "@/server/rulesets/types.ts";
import type DetailedCharacterAbilities from "@/server/rulesets/universal/DetailedCharacterAbilities.ts";
import {
  ALLOWED_ALL,
  type AptitudeLevelData,
} from "@/server/rulesets/universal/DetailedCharacterAptitudes.ts";
import type DetailedCharacterAptitudes from "@/server/rulesets/universal/DetailedCharacterAptitudes.ts";
import type DetailedCharacterClasses from "@/server/rulesets/universal/DetailedCharacterClasses.ts";
import type DetailedCharacterModifiers from "@/server/rulesets/universal/DetailedCharacterModifiers.ts";
import type DetailedCharacterPowers from "@/server/rulesets/universal/DetailedCharacterPowers.ts";
import type DetailedCharacterPowerGroupings from "@/server/rulesets/universal/DetailedCharacterPowerGroupings.ts";
import type {
  Aptitude,
  CharacterLevel,
  Klass,
  KlassLevel,
  Modifier,
  Power,
  Property,
} from "@/shared/relations.ts";
import { spellPossessionSlug, stripSeparators } from "@/shared/utils.ts";
import type { FeatWithPMR, KlassLevelWithPMR, PowerWithPMR } from "./DetailedCharacterDataLoader.ts";

export default class DetailedCharacterSpellcasting {
  // Bonus caster level state
  private bonusKlassLevelClassMap = new Map<string, string>();
  private bonusKlassLevelModifiers: Modifier[] = [];
  private bonusKlassLevels: KlassLevel[] = [];
  /** Maps bonus klass level ID → granting source name (e.g. "Stormlord Level 1") */
  private bonusKlassLevelAttribution = new Map<string, string>();

  // Aptitude power data
  private allAptitudePowers: Array<
    Power & {
      aptitudeId: string;
      powerLevel: number | null;
      saveName: string | null;
    }
  > = [];
  private aptitudePowerProperties: Property[] = [];
  private powerAptitudeLinks: { powerId: string; aptitudeId: string }[] = [];

  // Spell tags
  private spellTags: Record<string, string[]> = {};

  constructor(
    private readonly classes: DetailedCharacterClasses,
    private readonly abilities: DetailedCharacterAbilities,
    private readonly aptitudes: DetailedCharacterAptitudes,
    private readonly characterPowers: DetailedCharacterPowers,
    private readonly powerGroupings: DetailedCharacterPowerGroupings,
    private readonly characterModifiers: DetailedCharacterModifiers,
  ) {}

  getBonusKlassLevelClassMap() {
    return this.bonusKlassLevelClassMap;
  }

  getBonusKlassLevelModifiers() {
    return this.bonusKlassLevelModifiers;
  }

  getBonusKlassLevels() {
    return this.bonusKlassLevels;
  }

  getBonusKlassLevelAttribution() {
    return this.bonusKlassLevelAttribution;
  }

  getAptitudePowerProperties() {
    return this.aptitudePowerProperties;
  }

  getSpellTags() {
    return this.spellTags;
  }

  /** Lightweight init: sets spellcasting.arcane/divine based on caster type presence.
   *  Called before modifiers so requirements like Scribe Scroll can check spellcasting.arcane >= 1. */
  initSpellcastingHolder(
    holders: Holders,
    modifiers: Modifier[],
    klassCasterTypeMap: Map<string, "Arcane" | "Divine">,
  ) {
    // Build a map of spell aptitude key → caster type by scanning character classes.
    const spellAptitudeToCasterType = new Map<string, "Arcane" | "Divine">();
    const characterClasses = this.classes.getCharacterClasses();
    for (const [className, klassData] of Object.entries(characterClasses)) {
      const casterType = klassCasterTypeMap.get(klassData.klass.id);
      if (!casterType) continue;
      const aptitudeKey = stripSeparators(className + " Spells");
      spellAptitudeToCasterType.set(aptitudeKey, casterType);
    }

    // Scan modifiers for spell slot targets (aptitudes.<spellAptKey>.<level>.allowed)
    // to determine max spell level per caster type before modifiers are applied.
    let maxArcane = 0;
    let maxDivine = 0;
    for (const mod of modifiers) {
      const parts = mod.target.split(".");
      if (
        parts.length !== 4 ||
        parts[0] !== "aptitudes" ||
        parts[3] !== "allowed"
      )
        continue;
      const casterType = spellAptitudeToCasterType.get(parts[1]);
      if (!casterType) continue;
      const spellLevel = Number(parts[2]);
      if (Number.isNaN(spellLevel)) continue;
      if (casterType === "Arcane") maxArcane = Math.max(maxArcane, spellLevel);
      else maxDivine = Math.max(maxDivine, spellLevel);
    }

    const spellcasting = { arcane: maxArcane, divine: maxDivine };
    holders["spellcasting"] = { getSpellcasting: () => spellcasting };
  }

  fetchBonusCasterLevelData(
    rulesetData: CachedRulesetData,
    klassLevels: KlassLevelWithPMR[],
    feats: FeatWithPMR[],
    characterLevels: CharacterLevel[],
    rulesetKlasses: Klass[],
  ) {
    const characterClasses = this.classes.getCharacterClasses();
    const klassLevelPairs: Array<{ klassId: string; level: number }> = [];
    const pairToClassName = new Map<string, string>();

    for (const [className, klassData] of Object.entries(characterClasses)) {
      const bonus = klassData.bonuscasterlevel;
      if (bonus <= 0) continue;

      const actualLevel = klassData.level;
      const effectiveLevel = Math.min(actualLevel + bonus, 20);

      for (let level = actualLevel + 1; level <= effectiveLevel; level++) {
        klassLevelPairs.push({ klassId: klassData.klass.id, level });
        pairToClassName.set(`${klassData.klass.id}:${level}`, className);
      }
    }

    if (klassLevelPairs.length === 0) return;

    // Resolve bonus klass levels + their modifiers from the composed cache.
    const bonusKlassLevels: KlassLevel[] = [];
    for (const pair of klassLevelPairs) {
      const kl = rulesetData.klassLevelByKlassAndLevel.get(`${pair.klassId}:${pair.level}`);
      if (kl) bonusKlassLevels.push(kl);
    }
    if (bonusKlassLevels.length === 0) return;

    const bonusKlassLevelModifiers: Modifier[] = [];
    for (const kl of bonusKlassLevels) {
      const mods = rulesetData.modifiersBySource.get(kl.id);
      if (mods) {
        for (const m of mods) {
          if (m.sourceType === "klass_levels") bonusKlassLevelModifiers.push(m);
        }
      }
    }
    this.bonusKlassLevelModifiers = bonusKlassLevelModifiers;

    // Store bonus klass levels for source resolution in diagnostics
    this.bonusKlassLevels = bonusKlassLevels;

    // Populate bonusKlassLevelClassMap
    for (const kl of bonusKlassLevels) {
      const key = `${kl.klassId}:${kl.level}`;
      const className = pairToClassName.get(key);
      if (className) {
        this.bonusKlassLevelClassMap.set(kl.id, className);
      }
    }

    // Pre-built indices so the attribution loop below is O(classes × feats)
    // instead of O(classes × klassLevels × feats × characterLevels).
    const rulesetKlassById = new Map<string, Klass>();
    for (const k of rulesetKlasses) rulesetKlassById.set(k.id, k);
    const charLevelKey = (characterLevelId: string, klassLevelId: string) =>
      `${characterLevelId}:${klassLevelId}`;
    const charLevelIndex = new Set<string>();
    for (const cl of characterLevels) {
      charLevelIndex.add(charLevelKey(cl.id, cl.klassLevelId));
    }
    const bonusLevelsByKlassId = new Map<string, typeof bonusKlassLevels>();
    for (const kl of bonusKlassLevels) {
      const group = bonusLevelsByKlassId.get(kl.klassId);
      if (group) group.push(kl);
      else bonusLevelsByKlassId.set(kl.klassId, [kl]);
    }

    // Attribute each bonus klass level to the granting class level.
    for (const [className, klassData] of Object.entries(characterClasses)) {
      if (klassData.bonuscasterlevel <= 0) continue;

      const target = `classes.${stripSeparators(className)}.bonuscasterlevel`;
      // Feats granting this bonus — same answer regardless of which klass level
      // we're checking, so compute once per class rather than per klass level.
      const featsWithTargetMod = feats.filter(
        (f) =>
          f.characterLevelId &&
          f.modifiers.some(
            (m) => m.target === target && m.operator === "add",
          ),
      );

      const grantingLevels: Array<{ klassName: string; level: number }> = [];
      for (const kl of klassLevels) {
        if (
          kl.modifiers.some((m) => m.target === target && m.operator === "add")
        )
          continue;
        for (const feat of featsWithTargetMod) {
          if (!charLevelIndex.has(charLevelKey(feat.characterLevelId, kl.id))) continue;
          const klass = rulesetKlassById.get(kl.klassId);
          grantingLevels.push({
            klassName: klass?.name ?? "Unknown",
            level: kl.level,
          });
        }
      }
      grantingLevels.sort((a, b) => a.level - b.level);

      const receivingBonusLevels = (bonusLevelsByKlassId.get(klassData.klass.id) ?? [])
        .slice()
        .sort((a, b) => a.level - b.level);
      for (
        let i = 0;
        i < receivingBonusLevels.length && i < grantingLevels.length;
        i++
      ) {
        this.bonusKlassLevelAttribution.set(
          receivingBonusLevels[i].id,
          `${grantingLevels[i].klassName} Level ${grantingLevels[i].level}`,
        );
      }
    }
  }

  applyBonusCasterLevelModifiers(holders: Holders, feats: FeatWithPMR[]) {
    // Filter to aptitudes.* targets only — we only want spell progression
    const aptitudeModifiers = this.bonusKlassLevelModifiers.filter((m) =>
      m.target.startsWith("aptitudes."),
    );

    for (const modifier of aptitudeModifiers) {
      this.characterModifiers.evaluateModifier(modifier, holders);
    }

    this.syncDomainSpellAptitudes(feats);
  }

  /**
   * Sync domain spell aptitude levels to match the parent class's accessible spell levels.
   */
  private syncDomainSpellAptitudes(feats: FeatWithPMR[]) {
    const aptitudes = this.aptitudes.getAptitudes();
    const classes = this.classes.getCharacterClasses();

    // klassLevelId → className index so feat → class attribution is O(1)
    // instead of O(classes × levels) per feat modifier.
    const classNameByKlassLevelId = new Map<string, string>();
    for (const [className, klassData] of Object.entries(classes)) {
      for (const l of klassData.levels) {
        classNameByKlassLevelId.set(l.klassLevel.id, className);
      }
    }

    // Build domain aptitude key → owning class name by tracing feat → klassLevelId → class
    const domainAptKeys = new Map<string, string>();
    for (const feat of feats) {
      for (const mod of feat.modifiers) {
        if (!mod.target.includes("domainspells")) continue;
        const parts = mod.target.split(".");
        if (parts.length < 4 || parts[0] !== "aptitudes") continue;
        const aptKey = parts[1];
        if (domainAptKeys.has(aptKey)) continue;

        const className = classNameByKlassLevelId.get(feat.klassLevelId);
        if (className) domainAptKeys.set(aptKey, className);
      }
    }

    // For each domain spell aptitude, sync levels with the parent class spell aptitude
    for (const [domainAptKey, className] of domainAptKeys) {
      const domainApt = aptitudes[domainAptKey] as
        | Record<string, unknown>
        | undefined;
      const classSpellApt = aptitudes[stripSeparators(className + "spells")] as
        | Record<string, unknown>
        | undefined;
      if (!domainApt || !classSpellApt) continue;

      for (let level = 1; level <= 9; level++) {
        const classLevel = classSpellApt[String(level)] as
          | AptitudeLevelData
          | undefined;
        const domainLevel = domainApt[String(level)] as
          | AptitudeLevelData
          | undefined;
        if (!classLevel || !domainLevel) continue;

        if (classLevel.allowed === ALLOWED_ALL && domainLevel.allowed === 0) {
          domainLevel.allowed = ALLOWED_ALL;
          domainLevel.uses = 1;
        } else if (
          classLevel.allowed === 0 &&
          domainLevel.allowed === ALLOWED_ALL
        ) {
          domainLevel.allowed = 0;
          domainLevel.uses = 0;
        }
      }
    }
  }

  applyBonusSpellsFromAbilities(
    klassBonusSpellAbilityMap: Map<string, string>,
  ) {
    const characterClasses = this.classes.getCharacterClasses();
    const aptitudes = this.aptitudes.getAptitudes();

    for (const [className, klassData] of Object.entries(characterClasses)) {
      const abilityName = klassBonusSpellAbilityMap.get(klassData.klass.id);
      if (!abilityName) continue;

      const abilityMod = this.abilities.getAbilityModifier(abilityName);
      if (abilityMod <= 0) continue;

      const aptitudeKey = stripSeparators(className + " Spells");
      const aptitude = aptitudes[aptitudeKey];
      if (
        !aptitude ||
        !this.aptitudes.isLeveledAptitude(aptitudeKey)
      )
        continue;

      const aptitudeObj = aptitude as Record<string, unknown>;
      for (let spellLevel = 1; spellLevel <= 9; spellLevel++) {
        const levelData = aptitudeObj[String(spellLevel)] as
          | AptitudeLevelData
          | undefined;
        if (!levelData || levelData.allowed === 0) continue;
        if (abilityMod < spellLevel) continue;

        const bonusSpells = Math.floor((abilityMod - spellLevel) / 4) + 1;
        levelData.uses += bonusSpells;
      }
    }
  }

  /** Full computation: scans spell aptitude data for actual max spell levels. */
  computeSpellcasting(
    holders: Holders,
    klassCasterTypeMap: Map<string, "Arcane" | "Divine">,
  ) {
    const characterClasses = this.classes.getCharacterClasses();
    const aptitudes = this.aptitudes.getAptitudes();

    let maxArcane = 0;
    let maxDivine = 0;

    for (const [className, klassData] of Object.entries(characterClasses)) {
      const casterType = klassCasterTypeMap.get(klassData.klass.id);
      if (!casterType) continue;

      const aptitudeKey = stripSeparators(className + " Spells");
      const aptitude = aptitudes[aptitudeKey];
      if (
        !aptitude ||
        !this.aptitudes.isLeveledAptitude(aptitudeKey)
      )
        continue;

      const aptitudeObj = aptitude as Record<string, unknown>;
      let maxLevel = 0;
      for (let spellLevel = 9; spellLevel >= 0; spellLevel--) {
        const levelData = aptitudeObj[String(spellLevel)] as
          | AptitudeLevelData
          | undefined;
        if (levelData && levelData.allowed !== 0) {
          maxLevel = spellLevel;
          break;
        }
      }

      if (casterType === "Arcane") maxArcane = Math.max(maxArcane, maxLevel);
      else maxDivine = Math.max(maxDivine, maxLevel);
    }

    const spellcasting = { arcane: maxArcane, divine: maxDivine };
    holders["spellcasting"] = { getSpellcasting: () => spellcasting };
  }

  fetchAptitudePowerData(
    rulesetData: CachedRulesetData,
    powers: PowerWithPMR[],
  ) {
    const aptitudes = this.aptitudes.getAptitudes();
    const perAptitudeLevels = new Map<string, Set<number>>();
    const unleveledAptitudeIds = new Set<string>();

    for (const [key, aptitude] of Object.entries(aptitudes)) {
      if (this.aptitudes.isLeveledAptitude(key)) {
        const aptitudeObj = aptitude as Record<string, unknown>;
        const levels = new Set<number>();
        for (let level = 0; level <= 9; level++) {
          const levelData = aptitudeObj[String(level)] as
            | { allowed: number }
            | undefined;
          if (levelData && levelData.allowed === ALLOWED_ALL) {
            levels.add(level);
          }
        }
        if (levels.size > 0) {
          perAptitudeLevels.set(aptitude.id, levels);
        }
      } else if (aptitude.allowed === ALLOWED_ALL) {
        unleveledAptitudeIds.add(aptitude.id);
      }
    }

    if (perAptitudeLevels.size === 0 && unleveledAptitudeIds.size === 0)
      return;

    // Iterate the composed powers once, emitting one row per matching
    // (power, aptitude) link — mirrors the old SQL join shape.
    const allAptitudePowers: Array<
      Power & { aptitudeId: string; powerLevel: number | null; saveName: string | null }
    > = [];
    for (const power of rulesetData.powers) {
      const save = power.saveId ? rulesetData.savesById.get(power.saveId) : undefined;
      const saveName = save?.name ?? null;
      for (const link of power.powersAptitudesInRules) {
        const leveledSet = perAptitudeLevels.get(link.aptitudeId);
        const isLeveled = leveledSet !== undefined && link.level !== null && leveledSet.has(link.level);
        const isUnleveled = unleveledAptitudeIds.has(link.aptitudeId);
        if (!isLeveled && !isUnleveled) continue;
        allAptitudePowers.push({
          ...power,
          aptitudeId: link.aptitudeId,
          powerLevel: link.level,
          saveName,
        });
      }
    }

    this.allAptitudePowers = allAptitudePowers;
    if (this.allAptitudePowers.length === 0) return;

    // Gather properties (own + template via sourceItemId-style inheritance does
    // not apply to powers) and the power→aptitude link table from the cache.
    // Virtuals already live in `powers` with their properties attached, so
    // they no longer need to be folded into `aptitudePowerProperties`.
    const aptitudePowerIds = new Set(this.allAptitudePowers.map((p) => p.id));
    const propertyEntityIds = new Set<string>(aptitudePowerIds);

    const properties: Property[] = [];
    for (const id of propertyEntityIds) {
      const ps = rulesetData.propertiesByEntity.get(id);
      if (ps) properties.push(...ps);
    }

    const allPowerIdSet = new Set<string>([...powers.map((p) => p.id), ...aptitudePowerIds]);
    const powerAptitudeLinks: { powerId: string; aptitudeId: string }[] = [];
    for (const id of allPowerIdSet) {
      const p = rulesetData.powersById.get(id);
      if (!p) continue;
      for (const link of p.powersAptitudesInRules) {
        powerAptitudeLinks.push({ powerId: p.id, aptitudeId: link.aptitudeId });
      }
    }

    this.aptitudePowerProperties = properties;
    this.powerAptitudeLinks = powerAptitudeLinks;
  }

  enrichAllKnownPowers(
    powers: PowerWithPMR[],
    klassLevels: KlassLevelWithPMR[],
    rulesetAptitudes: Aptitude[],
    klassBonusSpellAbilityMap: Map<string, string>,
  ) {
    if (this.allAptitudePowers.length === 0) return;

    // Map aptitude ID → class name by tracing applied modifiers with sourceType "klass_levels"
    const appliedModifiers = this.characterModifiers.getModifiers().appliedModifiers;
    const aptitudeIdToClassName = new Map<string, string>();
    const classes = this.classes.getClasses();
    const aptitudes = this.aptitudes.getAptitudes();
    const aptitudePowerAptitudeIds = new Set(
      this.allAptitudePowers.map((p) => p.aptitudeId),
    );

    for (const modifier of appliedModifiers) {
      if (modifier.sourceType !== "klass_levels") continue;
      const parts = modifier.target.split(".");
      if (parts[0] !== "aptitudes") continue;

      const aptitudeKey = parts[1];
      const aptitude = aptitudes[aptitudeKey];
      if (!aptitude || !aptitudePowerAptitudeIds.has(aptitude.id)) continue;
      if (aptitudeIdToClassName.has(aptitude.id)) continue;

      // Find which class owns this klass level
      for (const [className, klassData] of Object.entries(classes)) {
        const ownsLevel = klassData.levels.some(
          (level) => level.klassLevel.id === modifier.sourceId,
        );
        if (ownsLevel) {
          aptitudeIdToClassName.set(aptitude.id, className);
          break;
        }
      }

      // Fallback: check bonus klass levels from caster level advancement
      if (!aptitudeIdToClassName.has(aptitude.id)) {
        const bonusClassName = this.bonusKlassLevelClassMap.get(
          modifier.sourceId,
        );
        if (bonusClassName) {
          aptitudeIdToClassName.set(aptitude.id, bonusClassName);
        }
      }
    }

    // Map domain spell aptitudes via feat modifiers.
    for (const modifier of appliedModifiers) {
      if (modifier.sourceType !== "feats") continue;
      const parts = modifier.target.split(".");
      if (parts[0] !== "aptitudes") continue;

      const aptitudeKey = parts[1];
      const aptitude = aptitudes[aptitudeKey];
      if (!aptitude || !aptitudePowerAptitudeIds.has(aptitude.id)) continue;
      if (aptitudeIdToClassName.has(aptitude.id)) continue;
      if (!aptitude.name.endsWith("Domain Spells")) continue;

      // Trace feat → klassLevelId → class
      for (const [className, klassData] of Object.entries(classes)) {
        const ownsLevel = klassData.levels.some((level) =>
          level.feats.some((f) => f.id === modifier.sourceId),
        );
        if (ownsLevel) {
          aptitudeIdToClassName.set(aptitude.id, className);
          break;
        }
      }
    }

    // Build className → class spell aptitude ID map
    const classNameToSpellAptitudeId = new Map<string, string>();
    for (const [, clsName] of aptitudeIdToClassName) {
      if (classNameToSpellAptitudeId.has(clsName)) continue;
      const spellApt = aptitudes[`${clsName}spells`];
      if (spellApt) classNameToSpellAptitudeId.set(clsName, spellApt.id);
    }

    // Deduplicate: exclude powers already present on the character
    const existingPowerIds = new Set(powers.map((p) => p.id));

    const newPowers: PowerWithPMR[] = [];
    for (const power of this.allAptitudePowers) {
      if (existingPowerIds.has(power.id)) continue;

      const className = aptitudeIdToClassName.get(power.aptitudeId);
      if (!className) continue;

      const klassData = classes[className];
      if (!klassData || klassData.levels.length === 0) continue;

      // Merge domain spells into the class's main spell list
      const powerAptitude = Object.values(aptitudes).find(
        (a: { id: string }) => a.id === power.aptitudeId,
      ) as { id: string; name: string } | undefined;
      const resolvedAptitudeId = powerAptitude?.name.endsWith("Domain Spells")
        ? (classNameToSpellAptitudeId.get(className) ?? power.aptitudeId)
        : power.aptitudeId;

      const firstLevel = klassData.levels[0];
      const enrichedPower: PowerWithPMR = {
        ...power,
        aptitudeId: resolvedAptitudeId,
        klassLevelId: firstLevel.klassLevel.id,
        characterLevelId: firstLevel.characterLevel.id,
        free: true,
        properties: this.aptitudePowerProperties.filter(
          (p) => p.entityId === power.id,
        ),
        modifiers: [],
        requirements: [],
      };

      firstLevel.powers.push(enrichedPower);
      newPowers.push(enrichedPower);
    }

    if (newPowers.length > 0) {
      this.characterPowers.addPowerEntries(newPowers);
      for (const power of newPowers) {
        // Mark as known in spell map
        const apt = rulesetAptitudes.find(a => a.id === power.aptitudeId);
        if (apt) {
          const entry = this.characterPowers.getSpellEntry(
            stripSeparators(power.name),
            spellPossessionSlug(apt.name),
          );
          if (entry) entry.known = true;
        }

        let abilityDcName: string | null = null;
        const klassLevel = klassLevels.find(
          (kl) => kl.id === power.klassLevelId,
        );
        if (klassLevel) {
          abilityDcName =
            klassBonusSpellAbilityMap.get(klassLevel.klassId) ?? null;
        }
        this.powerGroupings.registerPower(
          { ...power, abilityDcName },
          power.properties,
        );
      }
      this.characterPowers.injectGroupings(
        this.powerGroupings.getPowerGroupings(),
      );
    }
  }

  buildSpellTags(
    feats: FeatWithPMR[],
    rulesetAptitudes: Aptitude[],
  ) {
    const characterFeatNames = new Set(feats.map((f) => f.name));

    const taggedAptitudes = new Map<string, string>();
    for (const apt of rulesetAptitudes) {
      if (
        apt.name.endsWith("Domain Spells") ||
        apt.name.endsWith("Specialist Spells")
      ) {
        const featName = apt.name.replace(/ Spells$/, "");
        if (characterFeatNames.has(featName))
          taggedAptitudes.set(apt.id, featName);
      }
    }
    if (taggedAptitudes.size === 0) return;

    for (const link of this.powerAptitudeLinks) {
      const tag = taggedAptitudes.get(link.aptitudeId);
      if (!tag) continue;
      if (!this.spellTags[link.powerId]) this.spellTags[link.powerId] = [];
      this.spellTags[link.powerId].push(tag);
    }
  }
}
