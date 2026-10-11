import type { CharacterRows } from "@/engine/core/module/index.ts";
import type { RulesIssue } from "@/engine/core/RulesError.ts";
import { type RulesetView } from "@/engine/core/view/index.ts";
import DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import BondedRaceData from "@/engine/rulesets/dnd3.5/rules/BondedRaceData.ts";
import { stripSeparators } from "@/shared/text.ts";
import { type BondedRaceStatBlock, STAT_BLOCK_FEAT_SKILL_BONUSES } from "@/vocabulary/dnd3.5/bondedCreatures.ts";

export default abstract class DetailedCharacterBonded extends DetailedCharacter {
  /** The creature's master, built before it (`Dnd35CharacterBuilder`): what its sheet derives from. */
  protected master?: DetailedCharacter;

  protected abstract applyMasterDerivation(master: DetailedCharacter): void;

  /**
   * None: a bonded creature's feats are its stat block's and those its hit dice give it (`scaleFeats`), never picked,
   * so its levels give no general feat to pick.
   */
  protected override countGeneralFeats(): number {
    return 0;
  }

  /** None: a stat block's skills are its totals, which no skill points buy. */
  protected override getSkillValidationIssues(): { budget: RulesIssue[]; ranks: RulesIssue[] } {
    return { budget: [], ranks: [] };
  }

  /**
   * The creature's master and stat block set its inputs (hit dice, base saves, natural armor and attacks, the stat
   * block's feats and skill totals) before requirements read the sheet and modifiers change it: an item's or a feat's
   * modifier adds on top. Then the character's own step, its race's adjustments to its ability scores. Weapon Finesse
   * on its natural attacks is settled with the rounds, as a character's on its weapons (`settleSheet`).
   */
  protected override prepareSheet(): void {
    if (this.character.parentCharacterId) this.applyMasterDerivation(this.requireMaster());

    const raceStats = BondedRaceData.getStats(this.data.race.name);
    if (raceStats) {
      if (raceStats.naturalAttacks.length > 0) {
        this.components.combat.setNaturalAttacks(raceStats.naturalAttacks);
        this.components.weapons.clearGroups();
      }

      this.applyRaceDefaults(raceStats);
    }

    super.prepareSheet();
  }

  /** Builds the creature from its rows, its sheet derived from its `master`'s, which comes built. */
  override build(rows: CharacterRows, view: RulesetView, master?: DetailedCharacter) {
    this.master = master;
    super.build(rows, view, master);
  }

  /**
   * The stat block's feats, as any granted feat is (`possessFeat`): possessed and counted, listed with the feats the
   * creature has without a pick (`getVirtualFeats`: its sheet and PDF), and their modifiers applied with the
   * character's, in the build's rounds, each behind its own requirements. A modifier that grants one of them later
   * finds it held, as a granted feat the character has.
   */
  protected applyGrantedFeats(featNames: string[]): void {
    for (const featName of featNames) {
      const featId = this.rulesetData.featIdBySlug.get(stripSeparators(featName));
      if (featId) this.joinModifiers(this.possessFeat(featId, false));
    }
  }

  /** The stat block's skills, then its feats, which add their bonuses to the totals set without them. */
  protected applyRaceDefaults(raceStats: BondedRaceStatBlock): void {
    const featNames = [...(raceStats.bonusFeats ?? []), ...(raceStats.baseFeats ?? [])];
    this.applySkillTotals(raceStats.baseSkillTotals ?? {}, raceStats.baseSkillRanks ?? {}, featNames);
    this.applyGrantedFeats(featNames);
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

  /** The creature's master, which its build is given: one it was saved with and its build lacks is an error. */
  protected requireMaster(): DetailedCharacter {
    if (!this.master) throw new Error(`Bonded's master not built: ${this.character.parentCharacterId}`);
    return this.master;
  }
}
