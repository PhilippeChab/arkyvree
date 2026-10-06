import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import { db, memoizeRequest } from "@/server/database/index.ts";
import { Characters, Visibility } from "@/server/repositories/index.ts";
import type { ValidationIssue, ValidationResult } from "@/server/rulesets/AbstractDetailedCharacter.ts";
import Dnd35DetailedCharacter from "@/server/rulesets/dnd3.5/DetailedCharacter.ts";
import type { Modifier } from "@/shared/relations.ts";

import { type BondedRaceStatBlock, getBondedRaceStats } from "./bondedRaceData.ts";

export default abstract class DetailedCharacterBonded extends Dnd35DetailedCharacter {
  protected cachedTotalHD: number | null = null;

  protected applyGrantedFeats(featNames: string[], rulesetData: CachedRulesetData): void {
    if (featNames.length === 0) return;
    const featModifiers: Modifier[] = [];
    for (const featName of featNames) {
      const entry = this.detailedCharacterFeats.getFeat(featName);
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

  protected abstract applyMasterDerivation(parentCharacterId: string, rulesetData: CachedRulesetData): Promise<void>;

  protected applyRaceDefaults(raceStats: BondedRaceStatBlock, rulesetData: CachedRulesetData): void {
    this.applyGrantedFeats([...(raceStats.bonusFeats ?? []), ...(raceStats.baseFeats ?? [])], rulesetData);
    this.applySkillTotals(raceStats.baseSkillTotals ?? {}, raceStats.baseSkillRanks ?? {});
  }

  /**
   * The stat block's skills, at its totals, with the ranks within them: an item's or a feat's modifier adds on top, and
   * so does a raised ability.
   */
  protected applySkillTotals(totals: Record<string, number>, ranks: Record<string, number> = {}): void {
    for (const [skillName, total] of Object.entries(totals)) {
      this.detailedCharacterSkills.setStatBlockTotal(skillName, total, ranks[skillName] ?? 0);
    }
  }

  /**
   * None: a bonded creature's feats are its stat block's and those its hit dice give it (`scaleFeats`), never picked,
   * so its levels give no general feat to pick.
   */
  protected override countGeneralFeats(): number {
    return 0;
  }

  protected override getSkillValidationIssues(): { budget: ValidationIssue[]; ranks: ValidationIssue[] } {
    return { budget: [], ranks: [] };
  }

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

  /**
   * The creature's master and stat block set its inputs (hit dice, base saves, natural armor and attacks, the stat
   * block's feats and skill totals) before requirements read the sheet and modifiers change it: an item's or a feat's
   * modifier adds on top. Then the character's own setup, Weapon Finesse on the natural attacks included.
   */
  protected override async preRequirementProcessing(rulesetData: CachedRulesetData): Promise<void> {
    if (this.character.parentCharacterId) {
      await this.applyMasterDerivation(this.character.parentCharacterId, rulesetData);
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
    await super.preRequirementProcessing(rulesetData);
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
