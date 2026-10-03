import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Constructor } from "@/server/mixins.ts";
import type { FeatWithPMR, KlassLevelWithPMR } from "@/server/rulesets/dnd3.5/DetailedCharacterDataLoader.ts";
import type SpellcastingState from "@/server/rulesets/dnd3.5/spellcasting/SpellcastingState.ts";
import type { Holders } from "@/server/rulesets/types.ts";
import { ALLOWED_ALL, type AptitudeLevelData } from "@/server/rulesets/universal/DetailedCharacterAptitudes.ts";
import type { CharacterLevel, Klass, KlassLevel, Modifier } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

/** Caster levels another class adds to a spellcasting class (a prestige class's +1 caster level), and the domain spells they bring. */
export function BonusCasterLevels<B extends Constructor<SpellcastingState>>(Base: B) {
  abstract class WithBonusCasterLevels extends Base {
    /**
     * Sync domain spell aptitude levels to match the parent class's accessible spell levels.
     */
    protected syncDomainSpellAptitudes(feats: FeatWithPMR[]) {
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
        const domainApt = aptitudes[domainAptKey] as Record<string, unknown> | undefined;
        const classSpellApt = aptitudes[stripSeparators(className + "spells")] as Record<string, unknown> | undefined;
        if (!domainApt || !classSpellApt) continue;

        for (let level = 1; level <= 9; level++) {
          const classLevel = classSpellApt[String(level)] as AptitudeLevelData | undefined;
          const domainLevel = domainApt[String(level)] as AptitudeLevelData | undefined;
          if (!classLevel || !domainLevel) continue;

          if (classLevel.allowed === ALLOWED_ALL && domainLevel.allowed === 0) {
            domainLevel.allowed = ALLOWED_ALL;
            domainLevel.uses = 1;
          } else if (classLevel.allowed === 0 && domainLevel.allowed === ALLOWED_ALL) {
            domainLevel.allowed = 0;
            domainLevel.uses = 0;
          }
        }
      }
    }

    applyBonusCasterLevelModifiers(holders: Holders, feats: FeatWithPMR[]) {
      // Filter to aptitudes.* targets only — we only want spell progression
      const aptitudeModifiers = this.bonusKlassLevelModifiers.filter((m) => m.target.startsWith("aptitudes."));

      for (const modifier of aptitudeModifiers) {
        this.characterModifiers.evaluateModifier(modifier, holders);
      }

      this.syncDomainSpellAptitudes(feats);
    }

    getBonusKlassLevelAttribution() {
      return this.bonusKlassLevelAttribution;
    }

    getBonusKlassLevelModifiers() {
      return this.bonusKlassLevelModifiers;
    }

    getBonusKlassLevels() {
      return this.bonusKlassLevels;
    }

    // oxlint-disable-next-line arkyvree/function-length -- a long function to split into steps
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
      const charLevelKey = (characterLevelId: string, klassLevelId: string) => `${characterLevelId}:${klassLevelId}`;
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
          (f) => f.characterLevelId && f.modifiers.some((m) => m.target === target && m.operator === "add"),
        );

        const grantingLevels: Array<{ klassName: string; level: number }> = [];
        for (const kl of klassLevels) {
          if (kl.modifiers.some((m) => m.target === target && m.operator === "add")) continue;
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
        for (let i = 0; i < receivingBonusLevels.length && i < grantingLevels.length; i++) {
          this.bonusKlassLevelAttribution.set(
            receivingBonusLevels[i].id,
            `${grantingLevels[i].klassName} Level ${grantingLevels[i].level}`,
          );
        }
      }
    }
  }
  return WithBonusCasterLevels;
}
