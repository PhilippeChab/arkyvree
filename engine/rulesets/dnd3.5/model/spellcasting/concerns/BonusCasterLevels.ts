import type { BuiltCharacter } from "@/engine/core/character/index.ts";
import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import { ALLOWED_ALL, type AptitudeLevelData } from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudesComponent.ts";
import AptitudesPaths from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudesPaths.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import ClassesPaths from "@/engine/rulesets/dnd3.5/model/classes/ClassesPaths.ts";
import type { CustomizedClassLevel, HeldFeat } from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import type SpellcastingState from "@/engine/rulesets/dnd3.5/model/spellcasting/SpellcastingState.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Klass, KlassLevel } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import type { Constructor } from "@/lib/mixins.ts";
import type { Modifier } from "@/shared/relations.ts";
import { MAX_SPELL_LEVEL } from "@/vocabulary/dnd3.5/spells.ts";

/** Caster levels another class adds to a spellcasting class (a prestige class's +1 caster level), and the domain and school slots they bring. */
export function BonusCasterLevels<B extends Constructor<SpellcastingState>>(Base: B) {
  abstract class WithBonusCasterLevels extends Base {
    /** Attributes each bonus class level to the class level that granted it ("Mystic Theurge Level 3"). */
    private attributeBonusLevels(
      bonusClassLevels: KlassLevel[],
      classLevels: CustomizedClassLevel[],
      feats: HeldFeat[],
      rulesetClasses: Klass[],
    ) {
      const rulesetClassById = new Map(rulesetClasses.map((k) => [k.id, k]));
      const bonusLevelsByClassId = Map.groupBy(bonusClassLevels, (kl) => kl.ownerId);

      for (const [className, classData] of Object.entries(this.classes.getCharacterClasses())) {
        if (classData.bonuscasterlevel <= 0) continue;

        const target = ClassesPaths.bonusCasterLevel(className);
        const grantingLevels = this.grantingLevels(target, classLevels, feats, rulesetClassById);
        const receivingBonusLevels = (bonusLevelsByClassId.get(classData.klass.id) ?? []).toSorted(
          (a, b) => a.position - b.position,
        );
        for (let i = 0; i < receivingBonusLevels.length && i < grantingLevels.length; i++) {
          this.bonusClassLevelAttribution.set(
            receivingBonusLevels[i].id,
            `${grantingLevels[i].className} Level ${grantingLevels[i].level}`,
          );
        }
      }
    }

    /**
     * The class levels each class's bonus caster levels reach past its own level, up to its caster level
     * (`casterLevelOf`), as `classId:level`, with the class's name.
     */
    private bonusLevelClassNames() {
      const classNameByLevel = new Map<string, string>();
      for (const [className, classData] of Object.entries(this.classes.getCharacterClasses())) {
        if (classData.bonuscasterlevel <= 0) continue;

        const casterLevel = this.casterLevelOf(classData);
        for (let level = classData.level + 1; level <= casterLevel; level++)
          classNameByLevel.set(`${classData.klass.id}:${level}`, className);
      }
      return classNameByLevel;
    }

    /**
     * Each list a feat brings that it gives slots in (`featListIds`: a cleric's domain, a specialist wizard's school):
     * the class whose level gave the feat, and the feat's modifiers on the list's slots. A list stays with the first feat.
     */
    private featListSlots(feats: HeldFeat[], featListIds: Set<string>) {
      const aptitudes = this.aptitudes.getAptitudes();
      const classNameByClassLevelId = this.classNameByClassLevelId();
      const slotsByList = new Map<string, { className: string; featId: string; modifiers: Modifier[] }>();
      for (const feat of feats) {
        // A feat held without a level (a modifier's) is of no class
        const className = feat.trackId === undefined ? undefined : classNameByClassLevelId.get(feat.trackId);
        if (!className) continue;
        for (const modifier of feat.modifiers) {
          const list = AptitudeTargets.parseSpellLevel(modifier.target)?.list;
          const listId = list === undefined ? undefined : aptitudes[list]?.id;
          if (list === undefined || !listId || !featListIds.has(listId)) continue;
          const slots = slotsByList.get(list) ?? { className, featId: feat.entity.id, modifiers: [] };
          if (slots.featId !== feat.entity.id) continue;
          slots.modifiers.push(modifier);
          slotsByList.set(list, slots);
        }
      }
      return slotsByList;
    }

    /**
     * The class levels that granted the bonus caster levels `target` adds to, in level order: each class level a feat
     * adding to it is held at (picked or granted there), but for a class level that adds to it itself.
     */
    private grantingLevels(
      target: string,
      classLevels: CustomizedClassLevel[],
      feats: HeldFeat[],
      rulesetClassById: Map<string, Klass>,
    ) {
      const featsWithTargetMod = feats.filter((f) =>
        f.modifiers.some((m) => m.target === target && m.operator === "add"),
      );

      const grantingLevels: Array<{ className: string; level: number }> = [];
      for (const kl of classLevels) {
        if (kl.modifiers.some((m) => m.target === target && m.operator === "add")) continue;
        for (const feat of featsWithTargetMod) {
          if (feat.trackId !== kl.id) continue;
          const klass = rulesetClassById.get(kl.ownerId);
          grantingLevels.push({
            className: klass?.name ?? "Unknown",
            level: kl.position,
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
      feats: HeldFeat[],
      featListIds: Set<string>,
      isGateMet: (modifier: Modifier, metTargets?: string[]) => boolean,
    ) {
      const aptitudeModifiers = this.bonusClassLevelModifiers.filter(
        (m) => AptitudesPaths.isAptitudeTarget(m.target) && isGateMet(m),
      );

      for (const modifier of aptitudeModifiers)
        character.modifierEvaluator.evaluateModifier(modifier, character.components);

      this.syncFeatListSlots(feats, featListIds, isGateMet);
    }

    /** The class levels the character's bonus caster levels reach, read off the view, and whose level gave each. */
    protected readBonusCasterLevels(
      rulesetData: RulesetData,
      classLevels: CustomizedClassLevel[],
      feats: HeldFeat[],
      rulesetClasses: Klass[],
    ) {
      const classNameByLevel = this.bonusLevelClassNames();
      const bonusClassLevels = [...classNameByLevel.keys()].flatMap(
        (key) => Dnd35View.of(rulesetData).classLevelByClassAndLevel.get(key) ?? [],
      );
      if (bonusClassLevels.length === 0) return;

      this.bonusClassLevelModifiers = bonusClassLevels.flatMap((kl) =>
        (rulesetData.modifiersBySource.get(kl.id) ?? []).filter((m) => m.sourceType === "class-levels"),
      );
      // Store bonus class levels for source resolution in diagnostics
      this.bonusClassLevels = bonusClassLevels;
      for (const kl of bonusClassLevels) {
        const className = classNameByLevel.get(`${kl.ownerId}:${kl.position}`);
        if (className) this.bonusClassLevelClassMap.set(kl.id, className);
      }
      this.attributeBonusLevels(bonusClassLevels, classLevels, feats, rulesetClasses);
    }

    /**
     * Keeps the slots a feat gives in a list it brings (a cleric's domain, a specialist wizard's school) at the spell
     * levels its class casts, bonus caster levels counted: a level the class casts gets the slots the feat gives there
     * whose requirements hold but the class's level (`isGateMet` with that target met), one it doesn't cast none. The
     * feat's modifiers open their levels by the class's own level alone.
     */
    protected syncFeatListSlots(
      feats: HeldFeat[],
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
          // A level the feat's own modifiers opened: its spells known, or its slots (a domain slot's, uses alone)
          const opened = listLevel.allowed !== 0 || listLevel.uses > 0;
          if (casts && !opened) {
            const given = this.slotsGiven(
              modifiers.filter(
                (modifier) =>
                  modifier.target.startsWith(AptitudesPaths.spellLevelPrefix(list, level)) &&
                  isGateMet(modifier, [classLevel]),
              ),
            );
            listLevel.uses += given.uses;
            listLevel.allowed = given.allowed;
          } else if (!casts && opened) {
            this.aptitudes.clearAllKnown(listLevel);
            listLevel.uses = 0;
          }
        }
      }
    }

    getBonusClassLevelAttribution() {
      return this.bonusClassLevelAttribution;
    }

    getBonusClassLevelModifiers() {
      return this.bonusClassLevelModifiers;
    }

    getBonusClassLevels() {
      return this.bonusClassLevels;
    }
  }
  return WithBonusCasterLevels;
}
