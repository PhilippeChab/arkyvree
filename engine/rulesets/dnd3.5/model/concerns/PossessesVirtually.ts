import { SPELL_FIELDS } from "@/engine/rulesets/dnd3.5/entities/spells/fields.ts";
import type CharacterState from "@/engine/rulesets/dnd3.5/model/CharacterState.ts";
import FeatsComponent from "@/engine/rulesets/dnd3.5/model/feats/FeatsComponent.ts";
import FeatsPaths from "@/engine/rulesets/dnd3.5/model/feats/FeatsPaths.ts";
import LanguagesPaths from "@/engine/rulesets/dnd3.5/model/languages/LanguagesPaths.ts";
import SpellsComponent from "@/engine/rulesets/dnd3.5/model/spells/SpellsComponent.ts";
import SpellsPaths from "@/engine/rulesets/dnd3.5/model/spells/SpellsPaths.ts";
import SpellLists from "@/engine/rulesets/dnd3.5/rules/SpellLists.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { formatFieldValues } from "@/shared/customization/fields.ts";
import type { Modifier } from "@/shared/relations.ts";
import { SPELL_SAVE_EFFECT } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * The feats, spells and languages a 3.5 character has without a pick: those its modifiers grant (`set …possessed`, `set
 * …known`), each given as its modifier applies in the build's rounds, behind its requirements as any modifier.
 */
export function PossessesVirtually<B extends Constructor<CharacterState>>(Base: B) {
  abstract class PossessingVirtually extends Base {
    /**
     * What a modifier that applied grants (it sets true a feat's possession, a spell's knowledge on a list, a language's
     * knowledge), given as it applies: a feat (`possessFeat`), a spell (`knowSpell`), a language it then speaks without
     * a pick. The modifiers of what it gives the character, which join the build.
     */
    protected override grantsOf(modifier: Modifier): Modifier[] {
      if (!this.isGrant(modifier)) return [];
      const { featIdBySlug, languageIdBySlug } = this.dnd35;
      const featSlug = FeatsPaths.parsePossessed(modifier.target);
      const featId = featSlug === undefined ? undefined : featIdBySlug.get(featSlug);
      if (featId) return this.possessFeat(featId, true);
      const known = SpellsPaths.parseKnown(modifier.target);
      if (known) return this.knowSpell(known.spell, known.list);
      const languageSlug = LanguagesPaths.parseKnown(modifier.target);
      const languageId = languageSlug === undefined ? undefined : languageIdBySlug.get(languageSlug);
      if (languageId) this.components.languages.grant(languageId);
      return [];
    }

    /** The view's 3.5 lists and indices. */
    private get dnd35(): Dnd35View {
      return Dnd35View.of(this.rulesetData);
    }

    /**
     * Makes the spell of `spellSlug` known on the list of `listSlug` (its first row there), a modifier's grant: one the
     * list knows already (picked, granted by a class level, or given before) is `given` there; one it doesn't is known
     * without a pick, at its DC (its list's ability, as a spell of the list its class casts gives it), its modifiers
     * joining the build once however many lists know it. Its modifiers, when they join.
     */
    private knowSpell(spellSlug: string, listSlug: string): Modifier[] {
      const { dnd35 } = this;
      const aptitudeId = SpellLists.of(this.rulesetData).aptitudeIdBySpellSlug.get(listSlug);
      const spellRow = dnd35.spellIdsBySlug
        .get(spellSlug)
        ?.map((id) => dnd35.spellsById.get(id))
        .find((row) => row && dnd35.listLinksOf(row.id).some((link) => link.toId === aptitudeId));
      if (!spellRow || aptitudeId === undefined) return [];
      const held = this.data.spells.filter((spell) => spell.entity.id === spellRow.id && spell.viaId === aptitudeId);
      for (const spell of held) spell.given = true;
      if (held.length > 0) return [];

      const abilityDcName =
        this.data.spells.findLast((spell) => !spell.virtual && spell.viaId === aptitudeId && spell.abilityDcName)
          ?.abilityDcName ?? null;
      const spell = SpellsComponent.toVirtualSpell(spellRow, aptitudeId, abilityDcName, this.rulesetData);
      if (!spell) return [];
      const joined = this.data.spells.some(({ entity }) => entity.id === spellRow.id);
      this.data.spells.push(spell);
      this.components.spellcasting.registerKnownSpells(this.rulesetData, [spell]);
      return joined ? [] : spell.modifiers;
    }

    /**
     * Possesses the feat of `featId` without a pick, a modifier's grant (`given`) or a bonded creature's stat block's:
     * one the character holds already (picked, granted by a class level, or possessed before) stays as it is, `given`
     * when a modifier gives it; one it doesn't is possessed and counted (`FeatsComponent.grant`) and listed with the
     * feats it has without a pick (`getVirtualFeats`). Its modifiers, which join the build behind their own requirements:
     * its own prerequisites don't gate it, what grants it does.
     */
    protected possessFeat(featId: string, given: boolean): Modifier[] {
      const held = this.data.feats.filter((feat) => feat.entity.id === featId);
      if (given) for (const feat of held) feat.given = true;
      const featRow = this.dnd35.featsById.get(featId);
      if (held.length > 0 || !featRow) return [];
      this.components.feats.grant(featRow.name);
      const feat = FeatsComponent.toVirtualFeat(featRow, given, this.rulesetData);
      this.data.feats.push(feat);
      return feat.modifiers;
    }

    /** The feats the character's modifiers make it possess without a pick, as its sheet lists them. */
    getVirtualFeats() {
      return this.data.feats
        .filter((feat) => feat.virtual)
        .map(({ entity }) => ({
          id: entity.id,
          name: entity.name,
          description: entity.description,
          fields: entity.fields,
        }));
    }

    /**
     * The spells the character's modifiers make it know without a pick (`set spells.<slug>.<apt>.known`), as its sheet
     * lists them: each with its list and level, its save, its DC (its groupings' bonuses, Spell Focus, as a picked
     * spell's: it goes through `registerSpell` too) and its fields' values.
     */
    getVirtualSpells() {
      const { spellSlugByAptitudeId } = SpellLists.of(this.rulesetData);
      return this.data.spells.flatMap(({ entity, saveName, spellLevel: level, viaId, virtual }) => {
        if (!virtual || level == null) return [];
        const aptitudeSlug = spellSlugByAptitudeId.get(viaId) ?? viaId;
        return [
          {
            id: entity.id,
            name: entity.name,
            description: entity.description,
            saveName,
            saveEffect: entity.fields[SPELL_SAVE_EFFECT] ?? null,
            aptitudeId: viaId,
            level,
            dc: this.components.spells.getSpell(entity.name)?.dc?.[aptitudeSlug]?.total ?? null,
            fields: formatFieldValues(SpellsComponent.textsOf(entity), (field) => SPELL_FIELDS.optionsOf(field)),
          },
        ];
      });
    }
  }

  return PossessingVirtually;
}
