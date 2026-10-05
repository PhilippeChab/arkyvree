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
import { parseLiteralValue } from "@/server/rulesets/universal/literalValue.ts";
import type { CharacterLevel, Klass, KlassLevel, Modifier } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

/** A character level's key in the index of the class levels the character took. */
const levelKey = (characterLevelId: string, klassLevelId: string) => `${characterLevelId}:${klassLevelId}`;

/** Caster levels another class adds to a spellcasting class (a prestige class's +1 caster level), and the domain and school slots they bring. */
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
     * Each list a feat brings that it gives slots in (`featListIds`: a cleric's domain, a specialist wizard's school):
     * the class whose level gave the feat, and the feat's modifiers on the list's slots. A list stays with the first feat.
     */
    private featListSlots(feats: FeatWithPMR[], featListIds: Set<string>) {
      const aptitudes = this.aptitudes.getAptitudes();
      const classNameByKlassLevelId = this.classNameByKlassLevelId();
      const slotsByList = new Map<string, { className: string; featId: string; modifiers: Modifier[] }>();
      for (const feat of feats) {
        const className = classNameByKlassLevelId.get(feat.klassLevelId);
        if (!className) continue;
        for (const modifier of feat.modifiers) {
          const list = SLOT_TARGET.exec(modifier.target)?.[1];
          const listId = list === undefined ? undefined : aptitudes[list]?.id;
          if (list === undefined || !listId || !featListIds.has(listId)) continue;
          const slots = slotsByList.get(list) ?? { className, featId: feat.id, modifiers: [] };
          if (slots.featId !== feat.id) continue;
          slots.modifiers.push(modifier);
          slotsByList.set(list, slots);
        }
      }
      return slotsByList;
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
     * The slots a feat's modifiers give a list at one spell level, as the paths allow them: `uses` and `allowed` added,
     * or `allowed` set to -1, every spell of the level known.
     */
    private slotsGiven(modifiers: Modifier[]) {
      let uses = 0;
      let allowed = 0;
      let allKnown = false;
      for (const modifier of modifiers) {
        const value = parseLiteralValue(modifier.value, "number");
        if (typeof value !== "number") continue;
        if (modifier.target.endsWith(".uses")) uses += value;
        else if (modifier.operator === "set" && value === ALLOWED_ALL) allKnown = true;
        else allowed += value;
      }
      return { uses, allowed: allKnown ? ALLOWED_ALL : allowed };
    }

    /**
     * Keeps the slots a feat gives in a list it brings (a cleric's domain, a specialist wizard's school) at the spell
     * levels its class casts, bonus caster levels counted: a level the class casts gets the slots the feat gives there,
     * one it doesn't cast none. The feat's modifiers open their levels by the class's own level alone.
     */
    protected syncFeatListSlots(feats: FeatWithPMR[], featListIds: Set<string>) {
      const aptitudes = this.aptitudes.getAptitudes();
      for (const [list, { className, modifiers }] of this.featListSlots(feats, featListIds)) {
        const listLevels = aptitudes[list] as Record<string, unknown> | undefined;
        const classLists = this.spellListsOf(className).flatMap((key) => {
          const classList = aptitudes[key] as Record<string, unknown> | undefined;
          return classList ? [classList] : [];
        });
        if (!listLevels || classLists.length === 0) continue;

        for (let level = 1; level <= 9; level++) {
          const listLevel = listLevels[String(level)] as AptitudeLevelData | undefined;
          const classLevels = classLists.flatMap((classList) => {
            const classLevel = classList[String(level)] as AptitudeLevelData | undefined;
            return classLevel ? [classLevel] : [];
          });
          if (!listLevel || classLevels.length < classLists.length) continue;

          const casts = classLevels.some((classLevel) => classLevel.allowed !== 0 || classLevel.uses > 0);
          if (casts && listLevel.allowed === 0) {
            const given = this.slotsGiven(
              modifiers.filter((modifier) => modifier.target.startsWith(`aptitudes.${list}.${level}.`)),
            );
            listLevel.uses += given.uses;
            listLevel.allowed = given.allowed;
          } else if (!casts && listLevel.allowed !== 0) {
            clearAllKnown(listLevel);
            listLevel.uses = 0;
          }
        }
      }
    }

    /**
     * Applies the spell progression (`aptitudes.*`) of the class levels bonus caster levels reach, each modifier while
     * its own requirements hold (`isGateMet`): a pious templar's slots go to the list she picked only. Then the lists a
     * feat brings (`featListIds`) follow their class's spell levels.
     */
    applyBonusCasterLevelModifiers(
      holders: Holders,
      feats: FeatWithPMR[],
      featListIds: Set<string>,
      isGateMet: (modifier: Modifier) => boolean,
    ) {
      const aptitudeModifiers = this.bonusKlassLevelModifiers.filter(
        (m) => m.target.startsWith("aptitudes.") && isGateMet(m),
      );

      for (const modifier of aptitudeModifiers) {
        this.characterModifiers.evaluateModifier(modifier, holders);
      }

      this.syncFeatListSlots(feats, featListIds);
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
