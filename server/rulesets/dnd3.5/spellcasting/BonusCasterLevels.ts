import type { CachedRulesetData } from "@/server/cache/rulesetCache/index.ts";
import type { Constructor } from "@/server/mixins.ts";
import type { FeatWithPMR, KlassLevelWithPMR } from "@/server/rulesets/dnd3.5/DetailedCharacterDataLoader.ts";
import type SpellcastingState from "@/server/rulesets/dnd3.5/spellcasting/SpellcastingState.ts";
import { SLOT_TARGET } from "@/server/rulesets/dnd3.5/spellcasting/spellLists.ts";
import type { Holders } from "@/server/rulesets/types.ts";
import {
  ALLOWED_ALL,
  type AptitudeLevelData,
  clearAllKnown,
} from "@/server/rulesets/universal/DetailedCharacterAptitudes.ts";
import type { CharacterLevel, Klass, KlassLevel, Modifier } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

/** A character level's key in the index of the class levels the character took. */
const levelKey = (characterLevelId: string, klassLevelId: string) => `${characterLevelId}:${klassLevelId}`;

/** Caster levels another class adds to a spellcasting class (a prestige class's +1 caster level), and the domain slots they bring. */
export function BonusCasterLevels<B extends Constructor<SpellcastingState>>(Base: B) {
  abstract class WithBonusCasterLevels extends Base {
    /** Attributes each bonus klass level to the class level that granted it ("Mystic Theurge Level 3"). */
    private attributeBonusLevels(
      bonusKlassLevels: KlassLevel[],
      klassLevels: KlassLevelWithPMR[],
      feats: FeatWithPMR[],
      characterLevels: CharacterLevel[],
      rulesetKlasses: Klass[],
    ) {
      // Pre-built indices so the attribution is O(classes × feats)
      // instead of O(classes × klassLevels × feats × characterLevels).
      const rulesetKlassById = new Map(rulesetKlasses.map((k) => [k.id, k]));
      const takenAt = new Set(characterLevels.map((cl) => levelKey(cl.id, cl.klassLevelId)));
      const bonusLevelsByKlassId = Map.groupBy(bonusKlassLevels, (kl) => kl.klassId);

      for (const [className, klassData] of Object.entries(this.classes.getCharacterClasses())) {
        if (klassData.bonuscasterlevel <= 0) continue;

        const target = `classes.${stripSeparators(className)}.bonuscasterlevel`;
        const grantingLevels = this.grantingLevels(target, klassLevels, feats, takenAt, rulesetKlassById);
        const receivingBonusLevels = (bonusLevelsByKlassId.get(klassData.klass.id) ?? []).toSorted(
          (a, b) => a.level - b.level,
        );
        for (let i = 0; i < receivingBonusLevels.length && i < grantingLevels.length; i++) {
          this.bonusKlassLevelAttribution.set(
            receivingBonusLevels[i].id,
            `${grantingLevels[i].klassName} Level ${grantingLevels[i].level}`,
          );
        }
      }
    }

    /**
     * The klass levels each class's bonus caster levels reach past its own level (up to 20), as `klassId:level`, with
     * the class's name.
     */
    private bonusLevelClassNames() {
      const classNameByLevel = new Map<string, string>();
      for (const [className, klassData] of Object.entries(this.classes.getCharacterClasses())) {
        const bonus = klassData.bonuscasterlevel;
        if (bonus <= 0) continue;

        const actualLevel = klassData.level;
        const effectiveLevel = Math.min(actualLevel + bonus, 20);
        for (let level = actualLevel + 1; level <= effectiveLevel; level++) {
          classNameByLevel.set(`${klassData.klass.id}:${level}`, className);
        }
      }
      return classNameByLevel;
    }

    /**
     * The class levels that granted the bonus caster levels `target` adds to, in level order: each level a feat adding
     * to it was taken at, but for a class level that adds to it itself.
     */
    private grantingLevels(
      target: string,
      klassLevels: KlassLevelWithPMR[],
      feats: FeatWithPMR[],
      takenAt: Set<string>,
      rulesetKlassById: Map<string, Klass>,
    ) {
      const featsWithTargetMod = feats.filter(
        (f) => f.characterLevelId && f.modifiers.some((m) => m.target === target && m.operator === "add"),
      );

      const grantingLevels: Array<{ klassName: string; level: number }> = [];
      for (const kl of klassLevels) {
        if (kl.modifiers.some((m) => m.target === target && m.operator === "add")) continue;
        for (const feat of featsWithTargetMod) {
          if (!takenAt.has(levelKey(feat.characterLevelId, kl.id))) continue;
          const klass = rulesetKlassById.get(kl.klassId);
          grantingLevels.push({
            klassName: klass?.name ?? "Unknown",
            level: kl.level,
          });
        }
      }
      return grantingLevels.sort((a, b) => a.level - b.level);
    }

    /**
     * Keeps the slots a feat gives in a list joining its class's list (a cleric's domain) at the spell levels that class
     * knows its list at: the levels bonus caster levels open get the list's slot, and those the class doesn't cast yet
     * have none. A list stays with the first class one of the character's feats gives it slots for.
     */
    protected syncJoinedListSlots(feats: FeatWithPMR[]) {
      const aptitudes = this.aptitudes.getAptitudes();
      const classNameByKlassLevelId = this.classNameByKlassLevelId();
      const joining = this.joiningClassNames();

      const classNameByList = new Map<string, string>();
      for (const feat of feats) {
        const className = classNameByKlassLevelId.get(feat.klassLevelId);
        if (!className) continue;
        for (const modifier of feat.modifiers) {
          const list = SLOT_TARGET.exec(modifier.target)?.[1];
          if (list === undefined || classNameByList.has(list) || !joining.get(list)?.has(className)) continue;
          classNameByList.set(list, className);
        }
      }

      for (const [list, className] of classNameByList) {
        const listLevels = aptitudes[list] as Record<string, unknown> | undefined;
        const classLists = this.spellListsOf(className).flatMap((key) => {
          const classList = aptitudes[key] as Record<string, unknown> | undefined;
          return classList ? [classList] : [];
        });
        if (!listLevels || classLists.length === 0) continue;

        for (let level = 1; level <= 9; level++) {
          const listLevel = listLevels[String(level)] as AptitudeLevelData | undefined;
          const known = classLists.flatMap((classList) => {
            const classLevel = classList[String(level)] as AptitudeLevelData | undefined;
            return classLevel ? [classLevel.allowed] : [];
          });
          if (!listLevel || known.length < classLists.length) continue;

          if (known.includes(ALLOWED_ALL) && listLevel.allowed === 0) {
            listLevel.allowed = ALLOWED_ALL;
            listLevel.uses = 1;
          } else if (known.every((allowed) => allowed === 0) && listLevel.allowed === ALLOWED_ALL) {
            clearAllKnown(listLevel);
            listLevel.uses = 0;
          }
        }
      }
    }

    /**
     * Applies the spell progression (`aptitudes.*`) of the class levels bonus caster levels reach, each modifier while
     * its own requirements hold (`isGateMet`): a pious templar's slots go to the list she picked only.
     */
    applyBonusCasterLevelModifiers(holders: Holders, feats: FeatWithPMR[], isGateMet: (modifier: Modifier) => boolean) {
      const aptitudeModifiers = this.bonusKlassLevelModifiers.filter(
        (m) => m.target.startsWith("aptitudes.") && isGateMet(m),
      );

      for (const modifier of aptitudeModifiers) {
        this.characterModifiers.evaluateModifier(modifier, holders);
      }

      this.syncJoinedListSlots(feats);
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

    fetchBonusCasterLevelData(
      rulesetData: CachedRulesetData,
      klassLevels: KlassLevelWithPMR[],
      feats: FeatWithPMR[],
      characterLevels: CharacterLevel[],
      rulesetKlasses: Klass[],
    ) {
      const classNameByLevel = this.bonusLevelClassNames();
      const bonusKlassLevels = [...classNameByLevel.keys()].flatMap(
        (key) => rulesetData.klassLevelByKlassAndLevel.get(key) ?? [],
      );
      if (bonusKlassLevels.length === 0) return;

      this.bonusKlassLevelModifiers = bonusKlassLevels.flatMap((kl) =>
        (rulesetData.modifiersBySource.get(kl.id) ?? []).filter((m) => m.sourceType === "klass_levels"),
      );
      // Store bonus klass levels for source resolution in diagnostics
      this.bonusKlassLevels = bonusKlassLevels;
      for (const kl of bonusKlassLevels) {
        const className = classNameByLevel.get(`${kl.klassId}:${kl.level}`);
        if (className) {
          this.bonusKlassLevelClassMap.set(kl.id, className);
        }
      }
      this.attributeBonusLevels(bonusKlassLevels, klassLevels, feats, characterLevels, rulesetKlasses);
    }
  }
  return WithBonusCasterLevels;
}
