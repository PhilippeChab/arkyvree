import { include } from "@/server/mixins.ts";
import type { Holders } from "@/server/rulesets/types.ts";
import { type AptitudeLevelData } from "@/server/rulesets/universal/DetailedCharacterAptitudes.ts";
import type { Modifier } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import { BonusCasterLevels } from "./spellcasting/BonusCasterLevels.ts";
import { KnownPowers } from "./spellcasting/KnownPowers.ts";
import SpellcastingState from "./spellcasting/SpellcastingState.ts";

/** A spell list's slot: `aptitudes.<list>.<spell level>.uses` or `.allowed`. */
const SLOT_TARGET = /^aptitudes\.([^.]+)\.\d+\.(?:uses|allowed)$/;

class DetailedCharacterSpellcasting extends include(SpellcastingState, BonusCasterLevels, KnownPowers) {
  /**
   * A class's spell lists: those its levels give slots in, a pious templar's paladin and blackguard lists (the slots of
   * the one she didn't pick gated out), else "<Class> Spells".
   */
  private spellListsOf(className: string): string[] {
    const { levels } = this.classes.getCharacterClasses()[className];
    const lists = new Set(
      levels.flatMap(({ klassLevel }) => klassLevel.modifiers.flatMap((m) => SLOT_TARGET.exec(m.target)?.[1] ?? [])),
    );
    return lists.size > 0 ? [...lists] : [stripSeparators(className + " Spells")];
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
      for (const list of this.spellListsOf(className)) spellAptitudeToCasterType.set(list, casterType);
    }

    // Scan modifiers for spell slot targets (aptitudes.<spellAptKey>.<level>.allowed)
    // to determine max spell level per caster type before modifiers are applied.
    let maxArcane = 0;
    let maxDivine = 0;
    for (const mod of modifiers) {
      const parts = mod.target.split(".");
      if (parts.length !== 4 || parts[0] !== "aptitudes" || parts[3] !== "allowed") continue;
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

  applyBonusSpellsFromAbilities(klassBonusSpellAbilityMap: Map<string, string>) {
    const characterClasses = this.classes.getCharacterClasses();
    const aptitudes = this.aptitudes.getAptitudes();

    for (const [className, klassData] of Object.entries(characterClasses)) {
      const abilityName = klassBonusSpellAbilityMap.get(klassData.klass.id);
      if (!abilityName) continue;

      const abilityMod = this.abilities.getAbilityModifier(abilityName);
      if (abilityMod <= 0) continue;

      // Each of its lists: one it has no slot in (a pious templar's other list) has none to add to
      for (const aptitudeKey of this.spellListsOf(className)) {
        const aptitude = aptitudes[aptitudeKey];
        if (!aptitude || !this.aptitudes.isLeveledAptitude(aptitudeKey)) continue;

        const aptitudeObj = aptitude as Record<string, unknown>;
        for (let spellLevel = 1; spellLevel <= 9; spellLevel++) {
          const levelData = aptitudeObj[String(spellLevel)] as AptitudeLevelData | undefined;
          if (!levelData || levelData.allowed === 0) continue;
          if (abilityMod < spellLevel) continue;

          const bonusSpells = Math.floor((abilityMod - spellLevel) / 4) + 1;
          levelData.uses += bonusSpells;
        }
      }
    }
  }

  /** Full computation: scans spell aptitude data for actual max spell levels. */
  computeSpellcasting(holders: Holders, klassCasterTypeMap: Map<string, "Arcane" | "Divine">) {
    const characterClasses = this.classes.getCharacterClasses();
    const aptitudes = this.aptitudes.getAptitudes();

    let maxArcane = 0;
    let maxDivine = 0;

    for (const [className, klassData] of Object.entries(characterClasses)) {
      const casterType = klassCasterTypeMap.get(klassData.klass.id);
      if (!casterType) continue;

      // The highest spell level any of its lists has slots at
      for (const aptitudeKey of this.spellListsOf(className)) {
        const aptitude = aptitudes[aptitudeKey];
        if (!aptitude || !this.aptitudes.isLeveledAptitude(aptitudeKey)) continue;

        const aptitudeObj = aptitude as Record<string, unknown>;
        let maxLevel = 0;
        for (let spellLevel = 9; spellLevel >= 0; spellLevel--) {
          const levelData = aptitudeObj[String(spellLevel)] as AptitudeLevelData | undefined;
          if (levelData && levelData.allowed !== 0) {
            maxLevel = spellLevel;
            break;
          }
        }

        if (casterType === "Arcane") maxArcane = Math.max(maxArcane, maxLevel);
        else maxDivine = Math.max(maxDivine, maxLevel);
      }
    }

    const spellcasting = { arcane: maxArcane, divine: maxDivine };
    holders["spellcasting"] = { getSpellcasting: () => spellcasting };
  }
}

export default DetailedCharacterSpellcasting;
