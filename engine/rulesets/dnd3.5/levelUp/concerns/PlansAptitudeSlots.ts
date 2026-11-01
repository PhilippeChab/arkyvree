import LiteralValue from "@/engine/core/paths/LiteralValue.ts";
import type LevelUpBase from "@/engine/rulesets/dnd3.5/levelUp/LevelUpBase.ts";
import type { FeatSlots, SpellSlots } from "@/engine/rulesets/dnd3.5/levelUp/PicksDistribution.ts";
import AptitudeTargets, { ALLOWED_ALL } from "@/engine/rulesets/dnd3.5/model/aptitudes/AptitudeTargets.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { isRecord } from "@/shared/isRecord.ts";
import type { Modifier } from "@/shared/relations.ts";

/**
 * A planned level's slot deltas: per feat pool, and per spell pool and spell level, where a level that makes every spell
 * of it known holds `ALLOWED_ALL`.
 */
interface SlotDeltas {
  feats: Record<string, number>;
  spells: Record<string, Record<string, number>>;
}

/**
 * Each planned level's feat and spell slots, from the ruleset's modifiers rather than a character build per level:
 * what its class level's modifiers and the feats it grants add to a pool (`aptitudes.<slug>.allowed`, a spell level's
 * `aptitudes.<slug>.<level>.allowed`), and the general feats each character level gives, by the ruleset's Settings.
 * The character's unspent slots (a human's bonus feat) go to the first level.
 */
export function PlansAptitudeSlots<B extends Constructor<LevelUpBase<DetailedCharacter>>>(Base: B) {
  abstract class PlanningAptitudeSlots extends Base {
    /**
     * Adds what modifiers targeting a pool's `aptitudes.<slug>.allowed` (a feat pool) or `aptitudes.<slug>.<level>.allowed`
     * (a spell pool's spell level) give a level. A spell level set to every spell of its list (`setsAllKnown`) stays so.
     */
    private addModifierDeltas(deltas: SlotDeltas, modifiers: Modifier[], featSlots: FeatSlots, spellSlots: SpellSlots) {
      const aptitudeSlugToId = this.dnd35.aptitudeIdBySlug;
      for (const mod of modifiers) {
        // A pool's slots take a literal: an add, or a spell level's set to all its spells (the paths allow nothing else)
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
          if (aptId && spellSlots[aptId]) {
            if (!deltas.spells[aptId]) deltas.spells[aptId] = {};
            const spellLevel = String(slot.level);
            const delta = deltas.spells[aptId][spellLevel];
            if (AptitudeTargets.setsAllKnown(mod) || delta === ALLOWED_ALL)
              deltas.spells[aptId][spellLevel] = ALLOWED_ALL;
            else deltas.spells[aptId][spellLevel] = (delta ?? 0) + value;
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
     * A planned level's slot deltas: its class level's modifiers, the modifiers of the feats granted there (its
     * `grants` links' targets), and the general feats it gives (`generalFeats`, its ruleset's Settings').
     */
    private levelDeltas(
      classLevelId: string,
      autoFeatRecords: readonly { toId: string }[],
      generalFeats: number,
      featSlots: FeatSlots,
      spellSlots: SpellSlots,
    ): SlotDeltas {
      const deltas: SlotDeltas = { feats: {}, spells: {} };
      const { aptitudeIdBySlug } = this.dnd35;
      const { modifiersBySource } = this.rulesetData;
      const add = (modifiers: Modifier[]) => this.addModifierDeltas(deltas, modifiers, featSlots, spellSlots);

      add(modifiersBySource.get(classLevelId) ?? []);
      for (const grant of autoFeatRecords) add(modifiersBySource.get(grant.toId) ?? []);

      const generalAptId = aptitudeIdBySlug.get(LevelRules.GENERAL_FEATS_APTITUDE_SLUG);
      if (generalAptId && featSlots[generalAptId] && generalFeats > 0)
        deltas.feats[generalAptId] = (deltas.feats[generalAptId] ?? 0) + generalFeats;
      return deltas;
    }

    /**
     * Each planned level's slots (`classLevelIds`, with the feats each grants, after the character's
     * `savedLevelCount` levels) in the character's feat and spell pools. `baselineAptitudes` are the character's
     * aptitudes as its sheet has them: a pool's counts, and a spell pool's spell levels by number.
     */
    protected planAptitudeSlots(
      classLevelIds: string[],
      grantedFeatRecords: (readonly { toId: string }[])[],
      featPoolIds: string[],
      spellPoolIds: string[],
      savedLevelCount: number,
      baselineAptitudes: Record<string, { allowed: number; id: string; spent: number } & Record<string, unknown>>,
    ): { perLevelFeatSlots: FeatSlots; perLevelSpellSlots: SpellSlots } {
      const perLevelFeatSlots: FeatSlots = {};
      const perLevelSpellSlots: SpellSlots = {};
      for (const aptId of featPoolIds) perLevelFeatSlots[aptId] = [];
      for (const aptId of spellPoolIds) perLevelSpellSlots[aptId] = [];
      // A spell level all known (the character's already, or a planned level's set to all) takes no slot from a later
      // add: the sheet's count, and the class tables'
      const allKnown = this.allKnownLevels(baselineAptitudes);
      const levelRules = LevelRules.of(this.view);

      for (let i = 0; i < classLevelIds.length; i++) {
        const deltas = this.levelDeltas(
          classLevelIds[i],
          grantedFeatRecords[i] ?? [],
          levelRules.countGeneralFeatsAfter(savedLevelCount + i),
          perLevelFeatSlots,
          perLevelSpellSlots,
        );
        for (const aptId of featPoolIds) perLevelFeatSlots[aptId].push(Math.max(0, deltas.feats[aptId] ?? 0));

        for (const aptId of spellPoolIds) {
          const slots: Record<string, number> = {};
          for (const [sl, delta] of Object.entries(deltas.spells[aptId] ?? {})) {
            const key = `${aptId}:${sl}`;
            if (allKnown.has(key)) continue;
            // A level that makes them all known has room for every spell of its level
            if (delta === ALLOWED_ALL) {
              allKnown.add(key);
              slots[sl] = Number.POSITIVE_INFINITY;
            } else if (delta > 0) {
              slots[sl] = delta;
            }
          }
          perLevelSpellSlots[aptId].push(slots);
        }
      }

      // Add baseline unspent slots to the first level (e.g., Human racial bonus feat)
      for (const [, apt] of Object.entries(baselineAptitudes)) {
        const baselineAvailable = apt.allowed - apt.spent;
        if (baselineAvailable > 0 && perLevelFeatSlots[apt.id]?.[0] !== undefined)
          perLevelFeatSlots[apt.id][0] += baselineAvailable;
      }

      return { perLevelFeatSlots, perLevelSpellSlots };
    }
  }
  return PlanningAptitudeSlots;
}
