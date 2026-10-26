import type { CharacterDataLoader } from "@/engine/core/character/index.ts";
import type { CharacterPicks, StoredAdvancement, StoredPick } from "@/engine/core/module/index.ts";
import type { RulesetData, ViewLink } from "@/engine/core/view/index.ts";
import type { LoadedCharacterData } from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import type { HeldSource, LoadedLevels, SkillPick } from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import SpellsComponent from "@/engine/rulesets/dnd3.5/model/spells/SpellsComponent.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { Feat, Spell } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import type { Constructor } from "@/lib/mixins.ts";
import { FEAT_STACKABLE } from "@/vocabulary/dnd3.5/fields/index.ts";

/**
 * What each saved level's class level grants (`grants`, its `grants` links of step `step`'s kind, by class level),
 * each with the entity it grants (`entityOf`: one the view leaves out, an archived feat or spell, is left out), held at
 * the level it's granted at, in the grant's pool. The class level is the one the view stands for the level's stored
 * one, which the character's input resolved: on a fork that copied the class after the level was saved, the stored id
 * still names the source's class level, and its copy's grants are the ones the view keys.
 */
function grantedAt<E>(
  levels: StoredAdvancement[],
  step: HeldSource<E>["step"],
  grants: (classLevelId: string) => readonly ViewLink[],
  entityOf: (link: ViewLink) => E | undefined,
): HeldSource<E>[] {
  return levels.flatMap((level) =>
    grants(level.trackId!).flatMap((grant) => {
      const entity = entityOf(grant);
      if (entity === undefined) return [];
      return [{ advancementId: level.id, entity, grant, step, trackId: grant.fromId, viaId: grant.viaId! }];
    }),
  );
}

/**
 * Each saved level's picks of a step (`picks`, in the order they were read) with the entity each names (`entityOf`),
 * held at the level it's picked at, whose track is its class level. The character's input holds a pick's references as
 * the ids the view stands for them (a fork's copy, the winner of books' copies), and the view holds every picked
 * entity: deleting one, a fork's deleting an inherited one and unsubscribing its book are refused while a character
 * picks it.
 */
function pickedAt<E>(picks: StoredPick[], levels: StoredAdvancement[], entityOf: (pick: StoredPick) => E | undefined) {
  const trackIds = new Map(levels.map((level) => [level.id, level.trackId]));
  return picks.flatMap((pick) => {
    const entity = entityOf(pick);
    const trackId = trackIds.get(pick.advancementId);
    return entity && trackId ? [{ advancementId: pick.advancementId, entity, pick, trackId }] : [];
  });
}

/** The character's levels and its picks of skills, feats and spells: picked, and granted by their class levels. */
export function LoadsPicks<B extends Constructor<CharacterDataLoader<LoadedCharacterData>>>(Base: B) {
  abstract class LoadingPicks extends Base {
    /**
     * The feats: picked and granted (a grant of a feat that doesn't stack, the character holds already, left out), in
     * the order the character took their levels; and the room the grants make, by pool.
     */
    private buildFeats(picks: CharacterPicks, rulesetData: RulesetData, { advancements }: LoadedLevels) {
      const dnd35 = Dnd35View.of(rulesetData);
      const picked = pickedAt(picks.feats, advancements, (pick) => dnd35.featsById.get(pick.entityId!)).map(
        ({ advancementId, entity, pick, trackId }): HeldSource<Feat> => ({
          advancementId,
          entity,
          step: "feats",
          trackId,
          viaId: pick.viaId!,
        }),
      );
      const granted = grantedAt(
        advancements,
        "feats",
        (classLevelId) => dnd35.grantedFeatsOf(classLevelId),
        (grant) => rulesetData.storedById("feats").get(grant.toId),
      );

      const pickedIds = new Set(picked.filter((feat) => !feat.entity.fields[FEAT_STACKABLE]).map((f) => f.entity.id));
      const seenGrantedIds = new Set<string>();
      const keptGrants = granted.filter(({ entity }) => {
        if (!entity.fields[FEAT_STACKABLE]) {
          if (pickedIds.has(entity.id)) return false;
          if (seenGrantedIds.has(entity.id)) return false;
          seenGrantedIds.add(entity.id);
        }
        return true;
      });

      // Apply feat modifiers in character-level order so later selections win for `set` targets (e.g.
      // bonded.familiar.race): picks and grants are gathered by kind, not by level, and a level a level-up replaces
      // keeps its place.
      const levelPosition = new Map(advancements.map((level) => [level.id, level.position]));
      const feats = [...picked, ...keptGrants].sort(
        (a, b) => (levelPosition.get(a.advancementId!) ?? 0) - (levelPosition.get(b.advancementId!) ?? 0),
      );
      return { feats, featGrants: keptGrants };
    }

    /**
     * The spells: picked, then granted, each at its spell level in its pool. A pick's or a grant's spell level is its
     * composed link's: the ruleset merges the books' copies of a spell and of a list, so a stored pair (Complete
     * Divine's Bane on Complete Warrior's copy of the favored soul's list) may have no link row of its own.
     */
    private buildSpells(picks: CharacterPicks, rulesetData: RulesetData, { advancements }: LoadedLevels) {
      const dnd35 = Dnd35View.of(rulesetData);
      const held = (source: HeldSource<Spell>) => ({
        ...source,
        free: source.grant?.free ?? false,
        saveName: SpellsComponent.saveNameOf(source.entity, rulesetData),
        spellLevel: dnd35.listLinksOf(source.entity.id).find((link) => link.toId === source.viaId)?.tier ?? null,
        viaId: source.viaId!,
      });
      const picked = pickedAt(picks.spells, advancements, (pick) => dnd35.spellsById.get(pick.entityId!)).map(
        ({ advancementId, entity, pick, trackId }) =>
          held({ advancementId, entity, step: "spells", trackId, viaId: pick.viaId! }),
      );
      const granted = grantedAt(
        advancements,
        "spells",
        (classLevelId) => dnd35.grantedSpellsOf(classLevelId),
        (grant) => rulesetData.storedById("spells").get(grant.toId),
      ).map(held);
      return { spells: [...picked, ...granted], spellGrants: granted.filter((spell) => !spell.free) };
    }

    /**
     * The character's skill points, feats and spells: what its levels pick and their class levels grant, as the view
     * composes them; and the room the grants make in each pool (a free spell's none), by the pool's id.
     */
    protected buildPicks(picks: CharacterPicks, rulesetData: RulesetData, levels: LoadedLevels) {
      const { skillsById } = Dnd35View.of(rulesetData);
      const skills = pickedAt(picks.skills, levels.advancements, (pick) => skillsById.get(pick.entityId!)).map(
        ({ advancementId, entity, pick, trackId }): SkillPick => ({
          advancementId,
          amount: pick.amount!,
          entity,
          trackId,
        }),
      );
      const { feats, featGrants } = this.buildFeats(picks, rulesetData, levels);
      const { spells, spellGrants } = this.buildSpells(picks, rulesetData, levels);
      const grantCountsByPool: Record<string, number> = {};
      for (const { viaId } of [...featGrants, ...spellGrants])
        grantCountsByPool[viaId!] = (grantCountsByPool[viaId!] ?? 0) + 1;
      return { feats, grantCountsByPool, skills, spells };
    }

    /**
     * The character's levels (its advancements, as the view reads them) in the order it took them, their class levels
     * (their tracks), and the hit points each rolled (its `hp` pick).
     */
    protected sortLevels(stored: StoredAdvancement[], picks: CharacterPicks): LoadedLevels {
      const advancements = stored.toSorted((a, b) => a.position - b.position);
      return {
        advancements,
        classLevelIds: advancements.map((level) => level.trackId!),
        hitPoints: new Map(picks.hp.map((pick) => [pick.advancementId, pick.amount!])),
      };
    }
  }

  return LoadingPicks;
}
