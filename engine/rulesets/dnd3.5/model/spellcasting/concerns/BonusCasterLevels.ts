import type { BuiltCharacter } from "@/engine/core/character/index.ts";
import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { ALLOWED_ALL, type AptitudeLevelData } from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudesComponent.ts";
import AptitudesPaths from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudesPaths.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import ClassesPaths from "@/engine/rulesets/dnd3.5/model/classes/ClassesPaths.ts";
import type { CustomizedClassLevel, CustomizedFeat } from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import type SpellcastingState from "@/engine/rulesets/dnd3.5/model/spellcasting/SpellcastingState.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { CharacterLevel, Klass, KlassLevel, Modifier } from "@/shared/relations.ts";
import { MAX_CLASS_LEVEL } from "@/vocabulary/dnd3.5/classes.ts";
import { MAX_SPELL_LEVEL } from "@/vocabulary/dnd3.5/spells.ts";

/** A character level's key in the index of the class levels the character took. */
function levelKey(characterLevelId: string, klassLevelId: string) {
  return `${characterLevelId}:${klassLevelId}`;
}

/** Caster levels another class adds to a spellcasting class (a prestige class's +1 caster level), and the domain and school slots they bring. */
export function BonusCasterLevels<B extends Constructor<SpellcastingState>>(Base: B) {
  abstract class WithBonusCasterLevels extends Base {
    /** Attributes each bonus klass level to the class level that granted it ("Mystic Theurge Level 3"). */
    private attributeBonusLevels(
      bonusKlassLevels: KlassLevel[],
      klassLevels: CustomizedClassLevel[],
      feats: CustomizedFeat[],
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

        const target = ClassesPaths.bonusCasterLevel(className);
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
     * The klass levels each class's bonus caster levels reach past its own level (up to `MAX_CLASS_LEVEL`), as `klassId:level`, with
     * the class's name.
     */
    private bonusLevelClassNames() {
      const classNameByLevel = new Map<string, string>();
      for (const [className, klassData] of Object.entries(this.classes.getCharacterClasses())) {
        const bonus = klassData.bonuscasterlevel;
        if (bonus <= 0) continue;

        const actualLevel = klassData.level;
        const effectiveLevel = Math.min(actualLevel + bonus, MAX_CLASS_LEVEL);
        for (let level = actualLevel + 1; level <= effectiveLevel; level++)
          classNameByLevel.set(`${klassData.klass.id}:${level}`, className);
      }
      return classNameByLevel;
    }

    /**
     * Each list a feat brings that it gives slots in (`featListIds`: a cleric's domain, a specialist wizard's school):
     * the class whose level gave the feat, and the feat's modifiers on the list's slots. A list stays with the first feat.
     */
    private featListSlots(feats: CustomizedFeat[], featListIds: Set<string>) {
      const aptitudes = this.aptitudes.getAptitudes();
      const classNameByKlassLevelId = this.classNameByKlassLevelId();
      const slotsByList = new Map<string, { className: string; featId: string; modifiers: Modifier[] }>();
      for (const feat of feats) {
        const className = classNameByKlassLevelId.get(feat.klassLevelId);
        if (!className) continue;
        for (const modifier of feat.modifiers) {
          const list = AptitudeTargets.parseSpellLevel(modifier.target)?.list;
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
      klassLevels: CustomizedClassLevel[],
      feats: CustomizedFeat[],
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
        const value = LiteralValue.parse(modifier.value, "number");
        if (typeof value !== "number") continue;
        if (modifier.target.endsWith(".uses")) uses += value;
        else if (modifier.operator === "set" && value === ALLOWED_ALL) allKnown = true;
        else allowed += value;
      }
      return { uses, allowed: allKnown ? ALLOWED_ALL : allowed };
    }

    /**
     * Applies the spell progression (`aptitudes.*`) of the class levels bonus caster levels reach to the built
     * `character`, each modifier while its own requirements hold (`isGateMet`): a pious templar's slots go to the list
     * she picked only. Then the lists a feat brings (`featListIds`) follow their class's spell levels. `isGateMet` takes
     * the targets to count as met.
     */
    protected applyBonusCasterLevels(
      character: BuiltCharacter,
      feats: CustomizedFeat[],
      featListIds: Set<string>,
      isGateMet: (modifier: Modifier, metTargets?: string[]) => boolean,
    ) {
      const aptitudeModifiers = this.bonusKlassLevelModifiers.filter(
        (m) => AptitudesPaths.isAptitudeTarget(m.target) && isGateMet(m),
      );

      for (const modifier of aptitudeModifiers)
        character.modifierEvaluator.evaluateModifier(modifier, character.components);

      this.syncFeatListSlots(feats, featListIds, isGateMet);
    }

    /** The class levels the character's bonus caster levels reach, read off the view, and whose level gave each. */
    protected readBonusCasterLevels(
      rulesetData: RulesetData,
      klassLevels: CustomizedClassLevel[],
      feats: CustomizedFeat[],
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
        if (className) this.bonusKlassLevelClassMap.set(kl.id, className);
      }
      this.attributeBonusLevels(bonusKlassLevels, klassLevels, feats, characterLevels, rulesetKlasses);
    }

    /**
     * Keeps the slots a feat gives in a list it brings (a cleric's domain, a specialist wizard's school) at the spell
     * levels its class casts, bonus caster levels counted: a level the class casts gets the slots the feat gives there
     * whose requirements hold but the class's level (`isGateMet` with that target met), one it doesn't cast none. The
     * feat's modifiers open their levels by the class's own level alone.
     */
    protected syncFeatListSlots(
      feats: CustomizedFeat[],
      featListIds: Set<string>,
      isGateMet: (modifier: Modifier, metTargets?: string[]) => boolean,
    ) {
      const aptitudes = this.aptitudes.getAptitudes();
      for (const [list, { className, modifiers }] of this.featListSlots(feats, featListIds)) {
        const classLevel = ClassesPaths.level(className);
        const listLevels = aptitudes[list] as Record<string, unknown> | undefined;
        const classLists = this.spellListsOf(className).flatMap((key) => {
          const classList = aptitudes[key] as Record<string, unknown> | undefined;
          return classList ? [classList] : [];
        });
        if (!listLevels || classLists.length === 0) continue;

        for (let level = 1; level <= MAX_SPELL_LEVEL; level++) {
          const listLevel = listLevels[String(level)] as AptitudeLevelData | undefined;
          const classLevels = classLists.flatMap((classList) => {
            const classLevel = classList[String(level)] as AptitudeLevelData | undefined;
            return classLevel ? [classLevel] : [];
          });
          if (!listLevel || classLevels.length < classLists.length) continue;

          const casts = classLevels.some((classLevel) => classLevel.allowed !== 0 || classLevel.uses > 0);
          if (casts && listLevel.allowed === 0) {
            const given = this.slotsGiven(
              modifiers.filter(
                (modifier) =>
                  modifier.target.startsWith(AptitudesPaths.spellLevelPrefix(list, level)) &&
                  isGateMet(modifier, [classLevel]),
              ),
            );
            listLevel.uses += given.uses;
            listLevel.allowed = given.allowed;
          } else if (!casts && listLevel.allowed !== 0) {
            this.aptitudes.clearAllKnown(listLevel);
            listLevel.uses = 0;
          }
        }
      }
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
  }
  return WithBonusCasterLevels;
}
