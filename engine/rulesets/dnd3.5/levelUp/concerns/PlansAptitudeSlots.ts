import type { FeatSlots, LevelUpBase, PowerSlots } from "@/engine/core/levelUp/index.ts";
import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import { ALLOWED_ALL } from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudesComponent.ts";
import AptitudeTargets from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { isRecord } from "@/shared/isRecord.ts";
import type { Modifier } from "@/shared/relations.ts";

/** A planned level's slot deltas: per feat pool, and per power pool and spell level. */
interface SlotDeltas {
  feats: Record<string, number>;
  powers: Record<string, Record<string, number>>;
}

/** The slots an all-known spell level counts as: every spell of its level. */
const ALL_KNOWN_SLOTS = 999;

/**
 * Each planned level's feat and power slots, from the ruleset's modifiers rather than a character build per level:
 * what its class level's modifiers and the feats it grants add to a pool (`aptitudes.<slug>.allowed`, a spell level's
 * `aptitudes.<slug>.<level>.allowed`), and the general feat every third character level. The character's unspent slots
 * (a human's bonus feat) go to the first level.
 */
export function PlansAptitudeSlots<B extends Constructor<LevelUpBase<DetailedCharacter>>>(Base: B) {
  abstract class PlanningAptitudeSlots extends Base {
    /**
     * Adds what modifiers targeting a pool's `aptitudes.<slug>.allowed` (a feat pool) or `aptitudes.<slug>.<level>.allowed`
     * (a power pool's spell level) give a level. Setting a spell level's to -1, "all spells known", counts as all of them.
     */
    private addModifierDeltas(deltas: SlotDeltas, modifiers: Modifier[], featSlots: FeatSlots, powerSlots: PowerSlots) {
      const aptitudeSlugToId = this.rulesetData.aptitudeIdBySlug;
      for (const mod of modifiers) {
        // A pool's slots take a literal: an add, or a spell level's set to -1 (the paths allow nothing else)
        const value = LiteralValue.parse(mod.value, "number");
        if (typeof value !== "number") continue;
        const pool = AptitudeTargets.parsePool(mod.target);
        if (pool !== undefined) {
          const aptId = aptitudeSlugToId.get(pool);
          if (aptId && featSlots[aptId]) deltas.feats[aptId] = (deltas.feats[aptId] ?? 0) + value;

          continue;
        }
        const slot = AptitudeTargets.parseSpellLevel(mod.target);
        if (slot?.field === "allowed") {
          const aptId = aptitudeSlugToId.get(slot.list);
          if (aptId && powerSlots[aptId]) {
            if (!deltas.powers[aptId]) deltas.powers[aptId] = {};
            const spellLevel = String(slot.level);
            if (mod.operator === "set" && value === -1) deltas.powers[aptId][spellLevel] = ALL_KNOWN_SLOTS;
            else deltas.powers[aptId][spellLevel] = (deltas.powers[aptId][spellLevel] ?? 0) + value;
          }
        }
      }
    }

    /** The spell levels whose spells the character knows all of already, by `aptitudeId:level`. */
    private allKnownLevels(aptitudes: Record<string, { id: string } & Record<string, unknown>>): Set<string> {
      const known = new Set<string>();
      for (const aptitude of Object.values(aptitudes)) {
        for (const [level, entry] of Object.entries(aptitude)) {
          if (/^\d+$/.test(level) && isRecord(entry) && entry.allowed === ALLOWED_ALL)
            known.add(`${aptitude.id}:${level}`);
        }
      }
      return known;
    }

    /**
     * A planned level's slot deltas: its klass level's modifiers, the modifiers of the feats granted there, and the
     * general feat every third character level.
     */
    private levelDeltas(
      klassLevelId: string,
      autoFeatRecords: { featsInRule: { id: string } }[],
      charLevel: number,
      featSlots: FeatSlots,
      powerSlots: PowerSlots,
    ): SlotDeltas {
      const deltas: SlotDeltas = { feats: {}, powers: {} };
      const { aptitudeIdBySlug, modifiersBySource } = this.rulesetData;
      const add = (modifiers: Modifier[]) => this.addModifierDeltas(deltas, modifiers, featSlots, powerSlots);

      add(modifiersBySource.get(klassLevelId) ?? []);
      for (const rec of autoFeatRecords) add(modifiersBySource.get(rec.featsInRule.id) ?? []);

      const generalAptId = aptitudeIdBySlug.get(LevelRules.GENERAL_FEATS_APTITUDE_SLUG);
      if (generalAptId && featSlots[generalAptId]) {
        const generalDelta = LevelRules.countGeneralFeats(charLevel) - LevelRules.countGeneralFeats(charLevel - 1);
        if (generalDelta > 0) deltas.feats[generalAptId] = (deltas.feats[generalAptId] ?? 0) + generalDelta;
      }
      return deltas;
    }

    /**
     * Each planned level's slots (`klassLevelIds`, with the feats each grants, after the character's
     * `savedLevelCount` levels) in the character's feat and power pools. `baselineAptitudes` are the character's
     * aptitudes as its sheet has them: a pool's counts, and a power pool's spell levels by number.
     */
    protected planAptitudeSlots(
      klassLevelIds: string[],
      grantedFeatRecords: { aptitudeId: string; featsInRule: { id: string } }[][],
      featPoolIds: string[],
      powerPoolIds: string[],
      savedLevelCount: number,
      baselineAptitudes: Record<string, { allowed: number; id: string; spent: number } & Record<string, unknown>>,
    ): { perLevelFeatSlots: FeatSlots; perLevelPowerSlots: PowerSlots } {
      const perLevelFeatSlots: FeatSlots = {};
      const perLevelPowerSlots: PowerSlots = {};
      for (const aptId of featPoolIds) perLevelFeatSlots[aptId] = [];
      for (const aptId of powerPoolIds) perLevelPowerSlots[aptId] = [];
      // A spell level all known (the character's already, or a planned level's set -1) takes no slot from a later add:
      // the sheet's count, and the class tables'
      const allKnown = this.allKnownLevels(baselineAptitudes);

      for (let i = 0; i < klassLevelIds.length; i++) {
        const deltas = this.levelDeltas(
          klassLevelIds[i],
          grantedFeatRecords[i] ?? [],
          savedLevelCount + i + 1,
          perLevelFeatSlots,
          perLevelPowerSlots,
        );
        for (const aptId of featPoolIds) perLevelFeatSlots[aptId].push(Math.max(0, deltas.feats[aptId] ?? 0));

        for (const aptId of powerPoolIds) {
          const slots: Record<string, number> = {};
          for (const [sl, delta] of Object.entries(deltas.powers[aptId] ?? {})) {
            const key = `${aptId}:${sl}`;
            if (allKnown.has(key)) continue;
            if (delta >= ALL_KNOWN_SLOTS) allKnown.add(key);
            if (delta > 0) slots[sl] = Math.min(delta, ALL_KNOWN_SLOTS);
          }
          perLevelPowerSlots[aptId].push(slots);
        }
      }

      // Add baseline unspent slots to the first level (e.g., Human racial bonus feat)
      for (const [, apt] of Object.entries(baselineAptitudes)) {
        const baselineAvailable = apt.allowed - apt.spent;
        if (baselineAvailable > 0 && perLevelFeatSlots[apt.id]?.[0] !== undefined)
          perLevelFeatSlots[apt.id][0] += baselineAvailable;
      }

      return { perLevelFeatSlots, perLevelPowerSlots };
    }
  }
  return PlanningAptitudeSlots;
}
