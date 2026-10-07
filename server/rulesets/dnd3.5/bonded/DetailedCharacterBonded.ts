import type { RulesetData } from "@/server/cache/rulesetCache/index.ts";
import { db, memoizeRequest } from "@/server/database/index.ts";
import { Characters, Visibility } from "@/server/repositories/index.ts";
import Dnd35DetailedCharacter from "@/server/rulesets/dnd3.5/character/DetailedCharacter.ts";
import { toVirtualFeat } from "@/server/rulesets/dnd3.5/loading/customizations.ts";
import type { ValidationIssue } from "@/server/rulesets/engine/types.ts";
import type { Modifier } from "@/shared/relations.ts";

import { type BondedRaceStatBlock, getBondedRaceStats } from "./bondedRaceData.ts";

export default abstract class DetailedCharacterBonded extends Dnd35DetailedCharacter {
  protected cachedTotalHD: number | null = null;

  /**
   * The stat block's feats, as any granted feat is: possessed and counted, and listed with the feats the creature has
   * without a pick (`getVirtuallyPossessedFeats`: its sheet and PDF), their modifiers applied. A feat the creature
   * already has, from a modifier that grants it, stays as it is, as a granted feat the character has does.
   */
  protected applyGrantedFeats(featNames: string[], rulesetData: RulesetData): void {
    if (featNames.length === 0) return;
    const featModifiers: Modifier[] = [];
    for (const featName of featNames) {
      const entry = this.components.feats.getFeat(featName);
      if (entry?.possessed) continue;
      if (entry) {
        entry.possessed = true;
        entry.count += 1;
      }
      const featRow = rulesetData.feats.find((f) => f.name === featName);
      if (!featRow) continue;
      const mods = rulesetData.modifiersBySource.get(featRow.id);
      if (mods) featModifiers.push(...mods);
      this.feats.push(toVirtualFeat(featRow, rulesetData));
    }
    if (featModifiers.length > 0 && this.components)
      this.modifierEvaluator.evaluateModifiers(this.components, featModifiers, this.requirementEvaluator);
  }

  protected abstract applyMasterDerivation(parentCharacterId: string, rulesetData: RulesetData): Promise<void>;

  protected applyRaceDefaults(raceStats: BondedRaceStatBlock, rulesetData: RulesetData): void {
    this.applyGrantedFeats([...(raceStats.bonusFeats ?? []), ...(raceStats.baseFeats ?? [])], rulesetData);
    this.applySkillTotals(raceStats.baseSkillTotals ?? {}, raceStats.baseSkillRanks ?? {});
  }

  /**
   * The stat block's skills, at its totals, with the ranks within them: an item's or a feat's modifier adds on top, and
   * so does a raised ability.
   */
  protected applySkillTotals(totals: Record<string, number>, ranks: Record<string, number> = {}): void {
    for (const [skillName, total] of Object.entries(totals))
      this.components.skills.setStatBlockTotal(skillName, total, ranks[skillName] ?? 0);
  }

  /**
   * None: a bonded creature's feats are its stat block's and those its hit dice give it (`scaleFeats`), never picked,
   * so its levels give no general feat to pick.
   */
  protected override countGeneralFeats(): number {
    return 0;
  }

  /** None: a stat block's skills are its totals, which no skill points buy. */
  protected override getSkillValidationIssues(): { budget: ValidationIssue[]; ranks: ValidationIssue[] } {
    return { budget: [], ranks: [] };
  }

  protected async loadMaster(parentCharacterId: string, rulesetData: RulesetData): Promise<Dnd35DetailedCharacter> {
    return await memoizeRequest(`bonded-master:${parentCharacterId}`, async () => {
      const masterRecord = await Characters.findOne(db, { id: parentCharacterId }, Visibility.All);
      if (!masterRecord) throw new Error(`Bonded's master not found: ${parentCharacterId}`);

      const composed = new Dnd35DetailedCharacter(masterRecord);
      await composed.build(db, undefined, { ruleset: this.ruleset!, rulesetData });
      return composed;
    });
  }

  /**
   * The creature's master and stat block set its inputs (hit dice, base saves, natural armor and attacks, the stat
   * block's feats and skill totals) before requirements read the sheet and modifiers change it: an item's or a feat's
   * modifier adds on top. Then the character's own setup, Weapon Finesse on the natural attacks included.
   */
  protected override async preRequirementProcessing(rulesetData: RulesetData): Promise<void> {
    if (this.character.parentCharacterId)
      await this.applyMasterDerivation(this.character.parentCharacterId, rulesetData);

    const raceStats = getBondedRaceStats(this.race?.name);
    if (raceStats) {
      if (raceStats.naturalAttacks.length > 0) {
        this.components.combat.setNaturalAttacks(raceStats.naturalAttacks);
        this.components.weapons.clearGroups();
      }

      this.applyRaceDefaults(raceStats, rulesetData);
    }

    if (this.cachedTotalHD !== null) this.components.combat.setHitDiceOverride(this.cachedTotalHD);

    await super.preRequirementProcessing(rulesetData);
  }
}
