import Dnd35PropertyTypes from "@/engine/rulesets/dnd3.5/Dnd35PropertyTypes.ts";
import type CharacterState from "@/engine/rulesets/dnd3.5/model/CharacterState.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/rules/SpellLists.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { formatPropertyValues, groupPropertyValues } from "@/shared/customization/properties.ts";

/** The feats and spells a 3.5 character has without a pick: those its modifiers grant (`set …possessed`, `set …known`). */
export function PossessesVirtually<B extends Constructor<CharacterState>>(Base: B) {
  abstract class PossessingVirtually extends Base {
    /** The feats the character's modifiers make it possess without a pick, as its sheet lists them. */
    getVirtualFeats() {
      return this.data.feats
        .filter((feat) => feat.virtual)
        .map((feat) => ({ id: feat.id, name: feat.name, description: feat.description, stackable: feat.stackable }));
    }

    /**
     * The spells the character's modifiers make it know without a pick (`set powers.<slug>.<apt>.known`), as its sheet
     * lists them: each with its list and level, its save, its DC (its groupings' bonuses, Spell Focus, as a picked
     * spell's: it goes through `registerPower` too) and its properties' values.
     */
    getVirtualPowers() {
      const { spellSlugByAptitudeId } = SpellLists.of(this.rulesetData);
      return this.data.powers.flatMap((power) => {
        const level = power.powerLevel;
        if (!power.virtual || level == null) return [];
        const aptitudeSlug = spellSlugByAptitudeId.get(power.aptitudeId) ?? power.aptitudeId;
        return [
          {
            id: power.id,
            name: power.name,
            description: power.description,
            saveName: power.saveName,
            saveEffect: power.saveEffect,
            aptitudeId: power.aptitudeId,
            level,
            dc: this.components.powers.getPower(power.name)?.dc?.[aptitudeSlug]?.total ?? null,
            properties: formatPropertyValues(
              groupPropertyValues(power.properties, Dnd35PropertyTypes.valuesOf),
              Dnd35PropertyTypes.valuesOf,
            ),
          },
        ];
      });
    }
  }

  return PossessingVirtually;
}
