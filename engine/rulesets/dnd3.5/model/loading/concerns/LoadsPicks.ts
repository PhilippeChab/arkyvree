import type { CharacterDataLoader } from "@/engine/core/character/index.ts";
import type { CharacterPicks, StoredAdvancement, StoredPick } from "@/engine/core/module/index.ts";
import type { RulesetData, ViewLink } from "@/engine/core/view/index.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import type { CharacterLevels, HeldFeat, HeldSpell } from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import SpellsComponent from "@/engine/rulesets/dnd3.5/model/spells/SpellsComponent.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Feat, Spell } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { FEAT_STACKABLE } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * What each saved level's class level grants (`grants`, its `grants` links, by class level), each with the entity it
 * grants (`entityOf`: one the view leaves out, an archived feat or spell, is left out), attached to the level it's
 * granted at. The class level is the one the view stands for the level's stored one, which `resolveLevels` resolved: on
 * a fork that copied the class after the level was saved, the stored id still names the source's class level, and its
 * copy's grants are the ones the view keys.
 */
function grantedAt<E, R>(
  levels: StoredAdvancement[],
  grants: (klassLevelId: string) => readonly ViewLink[],
  entityOf: (link: ViewLink) => E | undefined,
  toRow: (entity: E, grant: ViewLink) => R,
) {
  return levels.flatMap((level) =>
    grants(level.trackId!).flatMap((grant) => {
      const entity = entityOf(grant);
      return entity === undefined ? [] : [{ ...toRow(entity, grant), characterLevelId: level.id }];
    }),
  );
}

/**
 * Each saved level's picks of a step (`picks`, in the order they were read) with the entity each names (`entityOf`),
 * the level it's picked at and that level's class level (its advancement's track). The character's input holds a
 * pick's references as the ids the view stands for them (a fork's copy, the winner of books' copies), and the view
 * holds every picked entity: deleting one, a fork's deleting an inherited one and unsubscribing its book are refused
 * while a character picks it.
 */
function pickedAt<R extends object>(
  picks: StoredPick[],
  levels: StoredAdvancement[],
  entityOf: (pick: StoredPick) => R | undefined,
) {
  const klassLevelIds = new Map(levels.map((level) => [level.id, level.trackId]));
  return picks.flatMap((pick) => {
    const entity = entityOf(pick);
    const klassLevelId = klassLevelIds.get(pick.advancementId);
    return entity && klassLevelId ? [{ ...entity, klassLevelId, characterLevelId: pick.advancementId }] : [];
  });
}

/**
 * A class level's granted feat as the build reads it (`grant`, its `grants` link): the feat, then the grant's class
 * level, pool and flag, and its own id.
 */
function toGrantedFeat(feat: Feat, grant: ViewLink) {
  return {
    ...feat,
    klassLevelId: grant.fromId,
    aptitudeId: grant.viaId!,
    free: grant.free,
    klassLevelFeatId: grant.id,
  };
}

/** A class level's granted spell as the build reads it: the spell, then the grant's class level, pool and flag. */
function toGrantedSpell(spell: Spell, grant: ViewLink, rulesetData: RulesetData) {
  return { ...toSpellRow(spell, rulesetData), klassLevelId: grant.fromId, aptitudeId: grant.viaId!, free: grant.free };
}

/** A spell as a pick or a grant holds it: the view's, with its save's name. */
function toSpellRow(spell: Spell, rulesetData: RulesetData) {
  return { ...spell, saveName: SpellsComponent.saveNameOf(spell, rulesetData) };
}

/** The character's levels and its picks of skills, feats and spells: picked, and granted by their class levels. */
export function LoadsPicks<B extends Constructor<CharacterDataLoader<LoadedCharacterData>>>(Base: B) {
  abstract class LoadingPicks extends Base {
    /** The feats: picked and given (deduped), in character-level order; and the given per aptitude. */
    private buildFeats(picks: CharacterPicks, rulesetData: RulesetData, { characterLevels }: CharacterLevels) {
      const dnd35 = Dnd35View.of(rulesetData);
      const pickedFeats = pickedAt(picks.feats, characterLevels, (pick) => {
        const feat = dnd35.featsById.get(pick.entityId!);
        return feat && { ...feat, aptitudeId: pick.viaId! };
      });
      const givenFeats = grantedAt(
        characterLevels,
        (klassLevelId) => dnd35.grantedFeatsOf(klassLevelId),
        (grant) => rulesetData.storedById("feats").get(grant.toId),
        toGrantedFeat,
      );

      const pickedFeatIds = new Set(pickedFeats.filter((f) => !f.fields[FEAT_STACKABLE]).map((f) => f.id));
      const seenGivenFeatIds = new Set<string>();
      const dedupedGivenFeats = givenFeats.filter((feat) => {
        if (!feat.fields[FEAT_STACKABLE]) {
          if (pickedFeatIds.has(feat.id)) return false;
          if (seenGivenFeatIds.has(feat.id)) return false;
          seenGivenFeatIds.add(feat.id);
        }
        return true;
      });

      const klassLevelFeatCountsByAptitudeId = dedupedGivenFeats.reduce(
        (acc, feat) => {
          acc[feat.aptitudeId] = (acc[feat.aptitudeId] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      const allFeats: HeldFeat[] = [...pickedFeats, ...dedupedGivenFeats];

      // Apply feat modifiers in character-level order so later selections win for `set` targets (e.g.
      // bonded.familiar.race): picks and grants are gathered by kind, not by level, and a level a level-up replaces
      // keeps its place.
      const levelPosition = new Map(characterLevels.map((level) => [level.id, level.position]));
      allFeats.sort(
        (a, b) => (levelPosition.get(a.characterLevelId) ?? 0) - (levelPosition.get(b.characterLevelId) ?? 0),
      );
      return { allFeats, klassLevelFeatCountsByAptitudeId };
    }

    /**
     * The spells: picked, then given; and the given (not free) per aptitude. A pick's or a grant's spell level
     * is its composed link's: the ruleset merges the books' copies of a spell and of a list, so a stored pair (Complete
     * Divine's Bane on Complete Warrior's copy of the favored soul's list) may have no link row of its own.
     */
    private buildSpells(picks: CharacterPicks, rulesetData: RulesetData, { characterLevels }: CharacterLevels) {
      const dnd35 = Dnd35View.of(rulesetData);
      const withLevel = <T extends { aptitudeId: string; id: string }>(spell: T) => ({
        ...spell,
        spellLevel: dnd35.listLinksOf(spell.id).find((link) => link.toId === spell.aptitudeId)?.tier ?? null,
      });
      const pickedSpells = pickedAt(picks.spells, characterLevels, (pick) => {
        const spell = dnd35.spellsById.get(pick.entityId!);
        return spell && { ...toSpellRow(spell, rulesetData), aptitudeId: pick.viaId! };
      }).map(withLevel);
      const givenSpells = grantedAt(
        characterLevels,
        (klassLevelId) => dnd35.grantedSpellsOf(klassLevelId),
        (grant) => rulesetData.storedById("spells").get(grant.toId),
        (spell, grant) => toGrantedSpell(spell, grant, rulesetData),
      ).map(withLevel);

      const klassLevelSpellCountsByAptitudeId = givenSpells.reduce(
        (acc, spell) => {
          if (!spell.free) acc[spell.aptitudeId] = (acc[spell.aptitudeId] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      const allSpells: HeldSpell[] = [...pickedSpells, ...givenSpells];
      return { allSpells, klassLevelSpellCountsByAptitudeId };
    }

    /**
     * The character's skills, feats and spells: what its levels pick and their class levels grant, as the view composes
     * them.
     */
    protected buildPicks(picks: CharacterPicks, rulesetData: RulesetData, levels: CharacterLevels) {
      const { skillsById } = Dnd35View.of(rulesetData);
      const realSkills = pickedAt(picks.skills, levels.characterLevels, (pick) => {
        const skill = skillsById.get(pick.entityId!);
        return skill && { ...skill, rank: pick.amount! };
      });
      return {
        skills: realSkills,
        ...this.buildFeats(picks, rulesetData, levels),
        ...this.buildSpells(picks, rulesetData, levels),
      };
    }

    /**
     * The character's levels (its advancements, as the view reads them) in the order it took them, their class levels
     * (their tracks), and the hit points each rolled (its `hp` pick).
     */
    protected sortLevels(advancements: StoredAdvancement[], picks: CharacterPicks): CharacterLevels {
      const characterLevels = advancements.toSorted((a, b) => a.position - b.position);
      return {
        characterLevels,
        hitPoints: new Map(picks.hp.map((pick) => [pick.advancementId, pick.amount!])),
        klassLevelIds: characterLevels.map((level) => level.trackId!),
      };
    }
  }

  return LoadingPicks;
}
