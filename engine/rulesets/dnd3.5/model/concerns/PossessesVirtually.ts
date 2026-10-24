import Dnd35PropertyTypes from "@/engine/rulesets/dnd3.5/Dnd35PropertyTypes.ts";
import type CharacterState from "@/engine/rulesets/dnd3.5/model/CharacterState.ts";
import FeatsComponent from "@/engine/rulesets/dnd3.5/model/feats/FeatsComponent.ts";
import FeatsPaths from "@/engine/rulesets/dnd3.5/model/feats/FeatsPaths.ts";
import LanguagesPaths from "@/engine/rulesets/dnd3.5/model/languages/LanguagesPaths.ts";
import PowersComponent from "@/engine/rulesets/dnd3.5/model/powers/PowersComponent.ts";
import PowersPaths from "@/engine/rulesets/dnd3.5/model/powers/PowersPaths.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/rules/SpellLists.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { formatPropertyValues, groupPropertyValues } from "@/shared/customization/properties.ts";
import type { Modifier } from "@/shared/relations.ts";

/**
 * The feats, spells and languages a 3.5 character has without a pick: those its modifiers grant (`set …possessed`, `set
 * …known`), each given as its modifier applies in the build's rounds, behind its requirements as any modifier.
 */
export function PossessesVirtually<B extends Constructor<CharacterState>>(Base: B) {
  abstract class PossessingVirtually extends Base {
    /**
     * What a modifier that applied grants (it sets true a feat's possession, a spell's knowledge on a list, a language's
     * knowledge), given as it applies: a feat (`possessFeat`), a spell (`knowPower`), a language it then speaks without
     * a pick. The modifiers of what it gives the character, which join the build.
     */
    protected override grantsOf(modifier: Modifier): Modifier[] {
      if (!this.isGrant(modifier)) return [];
      const { featIdBySlug, languageIdBySlug } = Dnd35View.of(this.rulesetData);
      const featSlug = FeatsPaths.parsePossessed(modifier.target);
      const featId = featSlug === undefined ? undefined : featIdBySlug.get(featSlug);
      if (featId) return this.possessFeat(featId, true);
      const known = PowersPaths.parseKnown(modifier.target);
      if (known) return this.knowPower(known.spell, known.list);
      const languageSlug = LanguagesPaths.parseKnown(modifier.target);
      const languageId = languageSlug === undefined ? undefined : languageIdBySlug.get(languageSlug);
      if (languageId) this.components.languages.grant(languageId);
      return [];
    }

    /**
     * Makes the spell of `spellSlug` known on the list of `listSlug` (its first row there), a modifier's grant: one the
     * list knows already (picked, granted by a class level, or given before) is `given` there; one it doesn't is known
     * without a pick, at its DC (its list's ability, as a spell of the list its class casts gives it), its modifiers
     * joining the build once however many lists know it. Its modifiers, when they join.
     */
    private knowPower(spellSlug: string, listSlug: string): Modifier[] {
      const { powerIdsBySlug, powersById } = Dnd35View.of(this.rulesetData);
      const aptitudeId = SpellLists.of(this.rulesetData).aptitudeIdBySpellSlug.get(listSlug);
      const powerRow = powerIdsBySlug
        .get(spellSlug)
        ?.map((id) => powersById.get(id))
        .find((row) => row?.powersAptitudesInRules.some((pa) => pa.aptitudeId === aptitudeId));
      if (!powerRow || aptitudeId === undefined) return [];
      const held = this.data.powers.filter((power) => power.id === powerRow.id && power.aptitudeId === aptitudeId);
      for (const power of held) power.given = true;
      if (held.length > 0) return [];

      const abilityDcName =
        this.data.powers.findLast((power) => !power.virtual && power.aptitudeId === aptitudeId && power.abilityDcName)
          ?.abilityDcName ?? null;
      const power = PowersComponent.toVirtualPower(powerRow, aptitudeId, abilityDcName, this.rulesetData);
      if (!power) return [];
      const joined = this.data.powers.some(({ id }) => id === powerRow.id);
      this.data.powers.push(power);
      this.components.spellcasting.registerKnownPowers(this.rulesetData, [power]);
      return joined ? [] : power.modifiers;
    }

    /**
     * Possesses the feat of `featId` without a pick, a modifier's grant (`given`) or a bonded creature's stat block's:
     * one the character holds already (picked, granted by a class level, or possessed before) stays as it is, `given`
     * when a modifier gives it; one it doesn't is possessed and counted (`FeatsComponent.grant`) and listed with the
     * feats it has without a pick (`getVirtualFeats`). Its modifiers, which join the build behind their own requirements:
     * its own prerequisites don't gate it, what grants it does.
     */
    protected possessFeat(featId: string, given: boolean): Modifier[] {
      const held = this.data.feats.filter((feat) => feat.id === featId);
      if (given) for (const feat of held) feat.given = true;
      const featRow = Dnd35View.of(this.rulesetData).featsById.get(featId);
      if (held.length > 0 || !featRow) return [];
      this.components.feats.grant(featRow.name);
      const feat = { ...FeatsComponent.toVirtualFeat(featRow, this.rulesetData), given };
      this.data.feats.push(feat);
      return feat.modifiers;
    }

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
