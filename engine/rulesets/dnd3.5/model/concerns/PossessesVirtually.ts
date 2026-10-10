import type CharacterState from "@/engine/rulesets/dnd3.5/model/CharacterState.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { formatPropertyValues, groupPropertyValues } from "@/shared/customization/properties.ts";
import { getStaticPropertyValues } from "@/shared/dnd3.5/properties/index.ts";
import { toSpellPossessionSlug } from "@/shared/dnd3.5/spells.ts";
import type { PowerWithAptitudes } from "@/shared/relations.ts";

/** The feats and spells a 3.5 character has without a pick: those its modifiers grant (`set …possessed`, `set …known`). */
export function PossessesVirtually<B extends Constructor<CharacterState>>(Base: B) {
  abstract class PossessingVirtually extends Base {
    /** The feats the character's modifiers make it possess without a pick, as its sheet lists them. */
    getVirtualFeats() {
      return this.feats
        .filter((feat) => feat.virtual)
        .map((feat) => ({ id: feat.id, name: feat.name, description: feat.description, stackable: feat.stackable }));
    }

    /**
     * The spells the character's modifiers make it know without a pick (`set powers.<slug>.<apt>.known`), as its sheet
     * lists them: each with its list and level, its save, its DC (its groupings' bonuses, Spell Focus, as a picked
     * spell's: it goes through `registerPower` too) and its properties' values.
     */
    getVirtualPowers() {
      const saveIdToName = new Map<string, string>();
      for (const save of this.rulesetSaves) saveIdToName.set(save.id, save.name);

      const powerById = new Map<string, PowerWithAptitudes>();
      for (const power of this.rulesetPowers) powerById.set(power.id, power);

      return this.powers.flatMap((virtual) => {
        const power = virtual.virtual ? powerById.get(virtual.id) : undefined;
        const level = virtual.powerLevel;
        if (!power || level == null) return [];
        const aptitude = this.rulesetAptitudes.find((apt) => apt.id === virtual.aptitudeId);
        const aptitudeSlug = aptitude ? toSpellPossessionSlug(aptitude.name) : virtual.aptitudeId;
        return [
          {
            id: power.id,
            name: power.name,
            description: power.description,
            saveName: power.saveId ? (saveIdToName.get(power.saveId) ?? null) : null,
            saveEffect: power.saveEffect,
            aptitudeId: virtual.aptitudeId,
            level,
            dc: this.components.powers.getPower(virtual.name)?.dc?.[aptitudeSlug]?.total ?? null,
            properties: formatPropertyValues(
              groupPropertyValues(virtual.properties, getStaticPropertyValues),
              getStaticPropertyValues,
            ),
          },
        ];
      });
    }
  }

  return PossessingVirtually;
}
