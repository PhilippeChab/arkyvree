import type { CharacterRows } from "@/engine/core/module/index.ts";
import type { RulesetView, ValidationIssue } from "@/engine/core/types.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import Dnd35DetailedCharacter from "@/engine/rulesets/dnd3.5/character/DetailedCharacter.ts";
import Customizations from "@/engine/rulesets/dnd3.5/loading/Customizations.ts";
import type { Dnd35ProjectedCharacterData } from "@/engine/rulesets/dnd3.5/types.ts";
import type { Modifier } from "@/shared/relations.ts";

import BondedRaceData, { type BondedRaceStatBlock, STAT_BLOCK_FEAT_SKILL_BONUSES } from "./BondedRaceData.ts";

export default abstract class DetailedCharacterBonded extends Dnd35DetailedCharacter {
  protected cachedTotalHD: number | null = null;

  /** The creature's master, built before it (`buildCharacter`): what its sheet derives from. */
  protected master?: Dnd35DetailedCharacter;

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
      this.feats.push(Customizations.toVirtualFeat(featRow, rulesetData));
    }
    if (featModifiers.length > 0 && this.components)
      this.modifierEvaluator.evaluateModifiers(this.components, featModifiers, this.requirementEvaluator);
  }

  protected abstract applyMasterDerivation(master: Dnd35DetailedCharacter): void;

  /** The stat block's skills, then its feats, which add their bonuses to the totals set without them. */
  protected applyRaceDefaults(raceStats: BondedRaceStatBlock, rulesetData: RulesetData): void {
    const featNames = [...(raceStats.bonusFeats ?? []), ...(raceStats.baseFeats ?? [])];
    this.applySkillTotals(raceStats.baseSkillTotals ?? {}, raceStats.baseSkillRanks ?? {}, featNames);
    this.applyGrantedFeats(featNames, rulesetData);
  }

  /**
   * The stat block's skills, at its totals less what its feats add there (`STAT_BLOCK_FEAT_SKILL_BONUSES`), with the
   * ranks within them: each of those feats adds its bonus back as the ruleset has it, once, from whichever source
   * gives the creature the feat. An item's or another feat's modifier adds on top, and so does a raised ability.
   */
  protected applySkillTotals(totals: Record<string, number>, ranks: Record<string, number>, featNames: string[]): void {
    for (const [skillName, total] of Object.entries(totals)) {
      const featBonus = featNames.reduce(
        (sum, featName) => sum + (STAT_BLOCK_FEAT_SKILL_BONUSES[featName]?.[skillName] ?? 0),
        0,
      );
      this.components.skills.setStatBlockTotal(skillName, total, ranks[skillName] ?? 0, featBonus);
    }
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

  /**
   * The creature's master and stat block set its inputs (hit dice, base saves, natural armor and attacks, the stat
   * block's feats and skill totals) before requirements read the sheet and modifiers change it: an item's or a feat's
   * modifier adds on top. Then the character's own setup, Weapon Finesse on the natural attacks included.
   */
  protected override preRequirementProcessing(rulesetData: RulesetData): void {
    if (this.character.parentCharacterId) this.applyMasterDerivation(this.requireMaster());

    const raceStats = BondedRaceData.getStats(this.race?.name);
    if (raceStats) {
      if (raceStats.naturalAttacks.length > 0) {
        this.components.combat.setNaturalAttacks(raceStats.naturalAttacks);
        this.components.weapons.clearGroups();
      }

      this.applyRaceDefaults(raceStats, rulesetData);
    }

    if (this.cachedTotalHD !== null) this.components.combat.setHitDiceOverride(this.cachedTotalHD);

    super.preRequirementProcessing(rulesetData);
  }

  /** The creature's master, which its build is given: one it was saved with and its build lacks is an error. */
  protected requireMaster(): Dnd35DetailedCharacter {
    if (!this.master) throw new Error(`Bonded's master not built: ${this.character.parentCharacterId}`);
    return this.master;
  }

  /** Builds the creature from its rows, its sheet derived from its `master`'s, which comes built. */
  override build(
    rows: CharacterRows,
    view: RulesetView,
    projectedData?: Dnd35ProjectedCharacterData,
    master?: Dnd35DetailedCharacter,
  ) {
    this.master = master;
    super.build(rows, view, projectedData, master);
  }
}
