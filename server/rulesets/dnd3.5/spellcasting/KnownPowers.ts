import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Constructor } from "@/server/mixins.ts";
import type {
  FeatWithPMR,
  KlassLevelWithPMR,
  PowerWithPMR,
} from "@/server/rulesets/dnd3.5/DetailedCharacterDataLoader.ts";
import type SpellcastingState from "@/server/rulesets/dnd3.5/spellcasting/SpellcastingState.ts";
import { ALLOWED_ALL } from "@/server/rulesets/universal/DetailedCharacterAptitudes.ts";
import { spellPossessionSlug } from "@/shared/dnd3.5/spells.ts";
import type { Aptitude, Power, Property } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

/** The powers a character's aptitudes give it, each with what it knows of them, and the spell tags they carry. */
export function KnownPowers<B extends Constructor<SpellcastingState>>(Base: B) {
  abstract class WithKnownPowers extends Base {
    buildSpellTags(feats: FeatWithPMR[], rulesetAptitudes: Aptitude[]) {
      const characterFeatNames = new Set(feats.map((f) => f.name));

      const taggedAptitudes = new Map<string, string>();
      for (const apt of rulesetAptitudes) {
        if (apt.name.endsWith("Domain Spells") || apt.name.endsWith("Specialist Spells")) {
          const featName = apt.name.replace(/ Spells$/, "");
          if (characterFeatNames.has(featName)) taggedAptitudes.set(apt.id, featName);
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

    getSpellTags() {
      return this.spellTags;
    }

    // oxlint-disable-next-line arkyvree/function-length -- a long function to split into steps
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
      const aptitudePowerAptitudeIds = new Set(this.allAptitudePowers.map((p) => p.aptitudeId));

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
          const ownsLevel = klassData.levels.some((level) => level.klassLevel.id === modifier.sourceId);
          if (ownsLevel) {
            aptitudeIdToClassName.set(aptitude.id, className);
            break;
          }
        }

        // Fallback: check bonus klass levels from caster level advancement
        if (!aptitudeIdToClassName.has(aptitude.id)) {
          const bonusClassName = this.bonusKlassLevelClassMap.get(modifier.sourceId);
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
          const ownsLevel = klassData.levels.some((level) => level.feats.some((f) => f.id === modifier.sourceId));
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
        const powerAptitude = Object.values(aptitudes).find((a: { id: string }) => a.id === power.aptitudeId) as
          | { id: string; name: string }
          | undefined;
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
          properties: this.aptitudePowerProperties.filter((p) => p.entityId === power.id),
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
          const apt = rulesetAptitudes.find((a) => a.id === power.aptitudeId);
          if (apt) {
            const entry = this.characterPowers.getSpellEntry(
              stripSeparators(power.name),
              spellPossessionSlug(apt.name),
            );
            if (entry) entry.known = true;
          }

          let abilityDcName: string | null = null;
          const klassLevel = klassLevels.find((kl) => kl.id === power.klassLevelId);
          if (klassLevel) {
            abilityDcName = klassBonusSpellAbilityMap.get(klassLevel.klassId) ?? null;
          }
          this.powerGroupings.registerPower({ ...power, abilityDcName }, power.properties);
        }
        this.characterPowers.injectGroupings(this.powerGroupings.getPowerGroupings());
      }
    }

    fetchAptitudePowerData(rulesetData: CachedRulesetData, powers: PowerWithPMR[]) {
      const aptitudes = this.aptitudes.getAptitudes();
      const perAptitudeLevels = new Map<string, Set<number>>();
      const unleveledAptitudeIds = new Set<string>();

      for (const [key, aptitude] of Object.entries(aptitudes)) {
        if (this.aptitudes.isLeveledAptitude(key)) {
          const aptitudeObj = aptitude as Record<string, unknown>;
          const levels = new Set<number>();
          for (let level = 0; level <= 9; level++) {
            const levelData = aptitudeObj[String(level)] as { allowed: number } | undefined;
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

      if (perAptitudeLevels.size === 0 && unleveledAptitudeIds.size === 0) return;

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
  }
  return WithKnownPowers;
}
