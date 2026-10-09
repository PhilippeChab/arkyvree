import type CharacterState from "@/engine/rulesets/dnd3.5/model/CharacterState.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { toSpellPossessionSlug } from "@/shared/dnd3.5/spells.ts";
import type { PowerWithAptitudes, Property } from "@/shared/relations.ts";

/** The feats and spells a 3.5 character has without a pick: those its modifiers grant (`set …possessed`, `set …known`). */
export function PossessesVirtually<B extends Constructor<CharacterState>>(Base: B) {
  abstract class PossessingVirtually extends Base {
    getVirtuallyPossessedFeats() {
      return this.feats.filter((f) => f.virtual);
    }

    /**
     * Virtually possessed spells (granted via `set powers.<slug>.<apt>.known`
     * modifiers). Now that virtuals live in `this.powers` they go through
     * `registerPower` like real spells, so DC reflects grouping bonuses
     * (Spell Focus, etc.) without a separate registration pass.
     */
    getVirtuallyPossessedPowersWithAptitudes() {
      const saveIdToName = new Map<string, string>();
      for (const save of this.rulesetSaves) saveIdToName.set(save.id, save.name);

      const powerById = new Map<string, PowerWithAptitudes>();
      for (const power of this.rulesetPowers) powerById.set(power.id, power);

      const results: {
        aptitudeId: string;
        dc: number | null;
        level: number;
        power: PowerWithAptitudes;
        properties: Property[];
        saveName: string | null;
      }[] = [];
      for (const virtual of this.powers) {
        if (!virtual.virtual) continue;
        const fullPower = powerById.get(virtual.id);
        if (!fullPower) continue;
        const level = virtual.powerLevel;
        if (level == null) continue;
        const aptitude = this.rulesetAptitudes.find((apt) => apt.id === virtual.aptitudeId);
        const aptitudeSlug = aptitude ? toSpellPossessionSlug(aptitude.name) : virtual.aptitudeId;
        const dc = this.components.powers.getPower(virtual.name)?.dc?.[aptitudeSlug]?.total ?? null;
        const saveName = fullPower.saveId ? (saveIdToName.get(fullPower.saveId) ?? null) : null;
        results.push({
          power: fullPower,
          aptitudeId: virtual.aptitudeId,
          level,
          properties: virtual.properties,
          dc,
          saveName,
        });
      }
      return results;
    }
  }

  return PossessingVirtually;
}
