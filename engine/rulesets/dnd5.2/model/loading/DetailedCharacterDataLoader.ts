import { CharacterDataLoader, type LoadedCharacter, type ModifierSource } from "@/engine/core/character/index.ts";
import type { CharacterRows, StoredAdvancement, StoredCharacterLink } from "@/engine/core/module/index.ts";
import { type RulesetView } from "@/engine/core/view/index.ts";
import CharacterValues from "@/engine/rulesets/dnd5.2/characters/CharacterValues.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";
import type { Item, Klass, Language } from "@/engine/rulesets/dnd5.2/view/rows.ts";
import { include } from "@/lib/mixins.ts";
import type { Character } from "@/shared/relations.ts";
import type { CasterType } from "@/vocabulary/dnd5.2/classes.ts";

import { CustomizesEntities } from "./concerns/CustomizesEntities.ts";
import { LoadsPicks } from "./concerns/LoadsPicks.ts";
import { ReadsRuleset } from "./concerns/ReadsRuleset.ts";
import type {
  CustomizedBackground,
  CustomizedClassLevel,
  CustomizedSpecies,
  HeldFeat,
  HeldSpell,
} from "./loadedEntities.ts";

/**
 * What a D&D 5th Edition character has of its ruleset's entities (`partsOf`): its data past core's, but its own row and the
 * ruleset's Settings (`loadOwn`); and its classes' ids, whose modifiers it takes once each (`sourcesOf`).
 */
type LoadedParts = Omit<LoadedCharacterData, keyof LoadedCharacter | "character"> & {
  classIds: string[];
};

/**
 * What a D&D 5th Edition character is built from, past what core loads (`LoadedCharacter`, its inventory's items the module's): its rows,
 * as its ruleset's view composes them, and what they read of the view (its classes' fields, its skills' fields). The
 * ruleset's own lists the build reads off the view itself.
 */
export interface LoadedCharacterData extends LoadedCharacter<Item> {
  advancements: StoredAdvancement[];
  /** Its background, with its customizations: none before it has one. */
  background: CustomizedBackground | undefined;
  character: Character;
  classCasterTypeMap: Map<string, CasterType>;
  classes: Klass[];
  classLevels: CustomizedClassLevel[];
  classSpellcastingAbilityMap: Map<string, string>;
  feats: HeldFeat[];
  grantCountsByPool: Record<string, number>;
  languages: Language[];
  levelHitPoints: ReadonlyMap<string, number>;
  scoreLinks: StoredCharacterLink[];
  species: CustomizedSpecies;
  spells: HeldSpell[];
}

/**
 * The D&D 5th Edition loader, on core's (`CharacterDataLoader`): what a character has of its ruleset's entities (its levels, its
 * picks and grants, its classes, species, background and languages), each with its customizations from the view, the sources of its
 * modifiers in the order they apply, and its own row, ability scores and the ruleset's Settings. What its modifiers
 * grant it (a feat, a spell, a language) isn't loaded: a grant gives it as it applies, in the build's rounds behind its
 * requirements (`PossessesVirtually`).
 */
export default class DetailedCharacterDataLoader extends include(
  CharacterDataLoader<LoadedCharacterData, LoadedParts>,
  CustomizesEntities,
  LoadsPicks,
  ReadsRuleset,
) {
  /**
   * The character's data: core's (`loaded`, its inventory's items the module's, as its ruleset's view holds them), its parts,
   * its own row, and the ruleset's Settings.
   */
  protected override loadOwn(
    _view: RulesetView,
    { classIds: _classIds, ...parts }: LoadedParts,
    loaded: LoadedCharacter<Item>,
  ): LoadedCharacterData {
    return { ...loaded, ...parts, character: this.character };
  }

  /**
   * The character's ability scores and increases, its levels, its picks and grants, each with its customizations, and
   * its classes' fields.
   */
  protected override partsOf(rows: CharacterRows, view: RulesetView): LoadedParts {
    const { rulesetData } = view;
    const dnd52 = Dnd52View.of(rulesetData);
    // The character's species and background, from the view: its byId resolves a stored id (RulesetComposition)
    const species = dnd52.speciesById.get(CharacterValues.speciesOf(this.character));
    if (!species) throw new Error("Species not found");
    const backgroundId = CharacterValues.backgroundOf(this.character);
    const background = backgroundId === undefined ? undefined : dnd52.backgroundsById.get(backgroundId);

    const abilityLookup = new Map(dnd52.abilities.map((a) => [a.id, a.name]));
    const levels = this.sortLevels(rows.advancements, rows.picks);
    const { languages, classLevelsRaw, classes, classIds } = this.readCachedRows(
      rows,
      rulesetData,
      levels.classLevelIds,
    );
    const { feats, grantCountsByPool, spells } = this.buildPicks(rows.picks, rulesetData, levels);

    // Each entity's customizations: per-entity lookups resolve via the cache's pre-built Maps. The character's first
    // level's requirements are a class's multiclass prerequisites, which a first class doesn't meet
    const firstLevelId = levels.advancements[0]?.entryId;
    const classLevels = this.toCustomizedClassLevels(classLevelsRaw, rulesetData).classLevels.map((level) =>
      level.id === firstLevelId && level.position === 1 ? { ...level, requirements: [] } : level,
    );
    const classFields = this.readClassFields(classIds, rulesetData, abilityLookup);
    const dcAbilities = { classSpellcastingAbilityMap: classFields.classSpellcastingAbilityMap, classLevels };
    return {
      scoreLinks: rows.links.score,
      species: this.toCustomizedSpecies(species, rulesetData),
      background: this.toCustomizedBackground(background, rulesetData),
      languages,
      advancements: levels.advancements,
      levelHitPoints: levels.hitPoints,
      classIds,
      classLevels,
      classes,
      feats: this.toHeldFeats(feats, rulesetData),
      spells: this.toHeldSpells(spells, rulesetData, dcAbilities),
      grantCountsByPool,
      ...classFields,
    };
  }

  protected override sourcesOf(
    { background, feats, classIds, classLevels, spells, species }: LoadedParts,
    items: ModifierSource[],
    { rulesetData }: RulesetView,
  ): ModifierSource[] {
    return [
      species,
      ...(background ? [background] : []),
      ...items,
      ...classLevels,
      ...classIds.map((classId) => ({
        modifiers: rulesetData.modifiersBySource.get(classId) ?? [],
        requirements: rulesetData.requirementsByEntity.get(classId) ?? [],
      })),
      ...feats.map((feat) => (feat.grant ? { modifiers: feat.modifiers } : feat)),
      ...[...Map.groupBy(spells, (spell) => spell.entity.id).values()].map(([spell]) =>
        spell.free ? { modifiers: spell.modifiers } : spell,
      ),
    ];
  }
}
