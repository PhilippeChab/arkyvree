import type { CharacterDataLoader } from "@/engine/core/character/index.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import type { SavedPickRows } from "@/engine/rulesets/dnd3.5/levelUp/SavedPicks.ts";
import type {
  LoadedCharacterData,
  Resolve,
} from "@/engine/rulesets/dnd3.5/model/loading/DetailedCharacterDataLoader.ts";
import type { CharacterLevels, HeldFeat, HeldSpell } from "@/engine/rulesets/dnd3.5/model/loading/loadedEntities.ts";
import SpellsComponent from "@/engine/rulesets/dnd3.5/model/spells/SpellsComponent.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type {
  CharacterLevel,
  FeatWithAptitudes,
  KlassLevelFeat,
  KlassLevelSpell,
  SpellWithAptitudes,
} from "@/engine/rulesets/dnd3.5/view/rows.ts";
import type { Constructor } from "@/lib/mixins.ts";

/**
 * What each saved level's class level grants (`grants`, by class level), attached to the level it's granted at. The
 * class level is the one the view stands for the level's stored one, which `resolveLevels` resolved: on a fork that
 * copied the class after the level was saved, the stored id still names the source's class level, and its copy's
 * grants are the ones the view keys. The view's grants leave out an archived feat or spell.
 */
function grantedAt<G, R>(levels: CharacterLevel[], grants: Map<string, G[]>, toRow: (grant: G) => R) {
  return levels.flatMap((level) =>
    (grants.get(level.klassLevelId) ?? []).map((grant) => ({ ...toRow(grant), characterLevelId: level.id })),
  );
}

/**
 * Each saved level's picks (`links`, in the order they were read) with the entity each names (`entityOf`), the level
 * it's picked at and that level's class level. The repository maps a link's references to the ids the view stands for
 * them (a fork's copy, the winner of books' copies), and the view holds every picked entity: deleting one, a fork's
 * deleting an inherited one and unsubscribing its book are refused while a character picks it.
 */
function pickedAt<L extends { characterLevelId: string }, R extends object>(
  links: L[],
  levels: CharacterLevel[],
  entityOf: (link: L) => R | undefined,
) {
  const klassLevelIds = new Map(levels.map((level) => [level.id, level.klassLevelId]));
  return links.flatMap((link) => {
    const entity = entityOf(link);
    const klassLevelId = klassLevelIds.get(link.characterLevelId);
    return entity && klassLevelId ? [{ ...entity, klassLevelId, characterLevelId: link.characterLevelId }] : [];
  });
}

/** A feat as a pick or a grant holds it: the view's, without its pools' links. */
function toFeatRow({ featsAptitudesInRules: _links, ...feat }: FeatWithAptitudes) {
  return feat;
}

/** A class level's granted feat as the build reads it: the feat, then the grant's class level, pool and flag. */
function toGrantedFeat({ featsInRule, ...grant }: KlassLevelFeat & { featsInRule: FeatWithAptitudes }) {
  return {
    ...toFeatRow(featsInRule),
    klassLevelId: grant.klassLevelId,
    aptitudeId: grant.aptitudeId,
    free: grant.free,
    klassLevelFeatId: grant.id,
  };
}

/** A class level's granted spell as the build reads it: the spell, then the grant's class level, pool and flag. */
function toGrantedSpell(
  { spellsInRule, ...grant }: KlassLevelSpell & { spellsInRule: SpellWithAptitudes },
  rulesetData: RulesetData,
) {
  return {
    ...toSpellRow(spellsInRule, rulesetData),
    klassLevelId: grant.klassLevelId,
    aptitudeId: grant.aptitudeId,
    free: grant.free,
  };
}

/** A spell as a pick or a grant holds it: the view's, without its lists' links, with its save's name. */
function toSpellRow({ spellsAptitudesInRules: _links, ...spell }: SpellWithAptitudes, rulesetData: RulesetData) {
  return { ...spell, saveName: SpellsComponent.saveNameOf(spell, rulesetData) };
}

/** The character's levels and its picks of skills, feats and spells: picked, and granted by their class levels. */
export function LoadsPicks<B extends Constructor<CharacterDataLoader<LoadedCharacterData>>>(Base: B) {
  abstract class LoadingPicks extends Base {
    /** The feats: picked and given (deduped), in character-level order; and the given per aptitude. */
    private buildFeats(
      picks: SavedPickRows,
      rulesetData: RulesetData,
      { characterLevels }: CharacterLevels,
      resolve: Resolve,
    ) {
      const dnd35 = Dnd35View.of(rulesetData);
      const pickedFeats = pickedAt(resolve(picks.feats), characterLevels, (link) => {
        const feat = dnd35.featsById.get(link.featId);
        return feat && { ...toFeatRow(feat), aptitudeId: link.aptitudeId };
      });
      const givenFeats = grantedAt(characterLevels, dnd35.klassLevelFeatsWithFeatsByKlassLevel, toGrantedFeat);

      const pickedFeatIds = new Set(pickedFeats.filter((f) => !f.stackable).map((f) => f.id));
      const seenGivenFeatIds = new Set<string>();
      const dedupedGivenFeats = givenFeats.filter((feat) => {
        if (!feat.stackable) {
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
      // bonded.familiar.race): SQL joins don't preserve pick order, and a level a level-up replaces keeps its place.
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
    private buildSpells(
      picks: SavedPickRows,
      rulesetData: RulesetData,
      { characterLevels }: CharacterLevels,
      resolve: Resolve,
    ) {
      const dnd35 = Dnd35View.of(rulesetData);
      const withLevel = <T extends { aptitudeId: string; id: string }>(spell: T) => ({
        ...spell,
        spellLevel:
          dnd35.spellsById.get(spell.id)?.spellsAptitudesInRules.find((link) => link.aptitudeId === spell.aptitudeId)
            ?.level ?? null,
      });
      const pickedSpells = pickedAt(resolve(picks.spells), characterLevels, (link) => {
        const spell = dnd35.spellsById.get(link.spellId);
        return spell && { ...toSpellRow(spell, rulesetData), aptitudeId: link.aptitudeId };
      }).map(withLevel);
      const givenSpells = grantedAt(characterLevels, dnd35.klassLevelSpellsWithSpellsByKlassLevel, (grant) =>
        toGrantedSpell(grant, rulesetData),
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
    protected buildPicks(picks: SavedPickRows, rulesetData: RulesetData, levels: CharacterLevels, resolve: Resolve) {
      const { skillsById } = Dnd35View.of(rulesetData);
      const realSkills = pickedAt(resolve(picks.skills), levels.characterLevels, (link) => {
        const skill = skillsById.get(link.skillId);
        return skill && { ...skill, rank: link.rank };
      });
      return {
        skills: realSkills,
        ...this.buildFeats(picks, rulesetData, levels, resolve),
        ...this.buildSpells(picks, rulesetData, levels, resolve),
      };
    }

    /** The character's levels as the view reads them, in the order it took them, and their class levels. */
    protected resolveLevels(rawCharacterLevels: CharacterLevel[], resolve: Resolve): CharacterLevels {
      const characterLevels = resolve(rawCharacterLevels).toSorted((a, b) => a.position - b.position);
      return { characterLevels, klassLevelIds: characterLevels.map((level) => level.klassLevelId) };
    }
  }

  return LoadingPicks;
}
