import type { CachedRulesetData } from "@/server/cache/rulesetCache.ts";
import { db } from "@/server/database/index.ts";
import { Visibility } from "@/server/repositories/BaseRepository.ts";
import { Characters } from "@/server/repositories/index.ts";
import { memoizeRequest } from "@/server/database/requestCache.ts";
import type { ValidationIssue, ValidationResult } from "@/server/rulesets/AbstractDetailedCharacter.ts";
import Dnd35DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import type { Modifier } from "@/shared/relations.ts";
import { getBondedRaceStats, type BondedRaceStatBlock } from "./bondedRaceData.ts";
import { stripSeparators } from "@/shared/utils.ts";

export default abstract class DetailedCharacterBonded extends Dnd35DetailedCharacter {
  protected cachedTotalHD: number | null = null;

  protected override async postModifierProcessing(
    rulesetData: CachedRulesetData,
  ): Promise<void> {
    await super.postModifierProcessing(rulesetData);

    if (this.character.parentCharacterId) {
      await this.applyMasterDerivation(this.character.parentCharacterId, rulesetData);
      this.detailedCharacterSkills.refreshAbilityModifiers();
      this.detailedCharacterSavingThrows.refreshAbilityModifiers();
    }

    const raceStats = getBondedRaceStats(this.race?.name);
    if (raceStats) {
      if (raceStats.naturalAttacks.length > 0) {
        this.detailedCharacterCombat.setNaturalAttacks(raceStats.naturalAttacks);
      }
      this.applyRaceDefaults(raceStats, rulesetData);
    }

    if (this.cachedTotalHD !== null) {
      this.detailedCharacterCombat.setHitDiceOverride(this.cachedTotalHD);
    }
    this.detailedCharacterCombat.applyWeaponFinesse(this.detailedCharacterFeats);
    this.detailedCharacterCombat.updateTotals();
  }

  protected applyRaceDefaults(raceStats: BondedRaceStatBlock, rulesetData: CachedRulesetData): void {
    this.applyGrantedFeats(raceStats.baseFeats ?? [], rulesetData);
    this.applySkillTotals(raceStats.baseSkillTotals ?? {});
  }

  protected applyGrantedFeats(featNames: string[], rulesetData: CachedRulesetData): void {
    if (featNames.length === 0) return;
    const feats = this.detailedCharacterFeats.getFeats();
    const featModifiers: Modifier[] = [];
    for (const featName of featNames) {
      const entry = feats[stripSeparators(featName)];
      if (entry) entry.possessed = true;
      const featRow = rulesetData.feats.find((f) => f.name === featName);
      if (!featRow) continue;
      const mods = rulesetData.modifiersBySource.get(featRow.id);
      if (mods) featModifiers.push(...mods);
    }
    if (featModifiers.length > 0 && this.holders) {
      this.detailedCharacterModifiers.evaluateModifiers(
        this.holders,
        featModifiers,
        this.detailedCharacterRequirements,
      );
    }
  }

  protected applySkillTotals(totals: Record<string, number>): void {
    if (Object.keys(totals).length === 0) return;
    const skills = this.detailedCharacterSkills.getSkills();
    for (const [skillName, srdTotal] of Object.entries(totals)) {
      const entry = skills[stripSeparators(skillName)];
      if (entry) {
        entry.rank = 0;
        entry.misc = srdTotal - entry.ability - entry.size;
        entry.trained = srdTotal > 0;
      }
    }
    this.detailedCharacterSkills.updateTotals();
  }

  protected abstract applyMasterDerivation(
    parentCharacterId: string,
    rulesetData: CachedRulesetData,
  ): Promise<void>;

  protected async loadMaster(
    parentCharacterId: string,
    rulesetData: CachedRulesetData,
  ): Promise<Dnd35DetailedCharacter> {
    return await memoizeRequest(`bonded-master:${parentCharacterId}`, async () => {
      const masterRecord = await Characters.findOne(db, { id: parentCharacterId }, Visibility.All);
      if (!masterRecord) {
        throw new Error(`Bonded's master not found: ${parentCharacterId}`);
      }
      const composed = new Dnd35DetailedCharacter(masterRecord);
      await composed.build(db, undefined, {
        ruleset: this.ruleset!,
        cowData: rulesetData.cow,
        rulesetData,
      });
      return composed;
    });
  }

  protected override getSkillValidationIssues(): { budget: ValidationIssue[]; ranks: ValidationIssue[] } {
    return { budget: [], ranks: [] };
  }

  override validate(): ValidationResult {
    const issues: ValidationIssue[] = [];
    const aptitudes = this.detailedCharacterAptitudes.getAptitudes();
    for (const [, aptitude] of Object.entries(aptitudes)) {
      if (aptitude.allowed === -1) continue;
      if (aptitude.available > 0) {
        issues.push({
          category: "aptitudes",
          message: `${aptitude.name}: ${aptitude.available} unspent slot(s) (${aptitude.spent}/${aptitude.allowed})`,
        });
      } else if (aptitude.available < 0) {
        issues.push({
          category: "aptitudes",
          message: `${aptitude.name}: overspent by ${Math.abs(aptitude.available)} (${aptitude.spent}/${aptitude.allowed})`,
        });
      }
    }
    return { valid: issues.length === 0, issues };
  }
}
