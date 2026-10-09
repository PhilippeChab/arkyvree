import type { CharacterInput } from "@/engine/core/module/index.ts";
import type { RulesetData, RulesetView } from "@/engine/core/view/index.ts";
import CharacterBuilder from "@/engine/rulesets/dnd3.5/model/CharacterBuilder.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import type { CharacterLevel, Feat, Modifier, Power, Property, Requirement, Skill } from "@/shared/relations.ts";

/** A feat a projection adds, picked or granted at one of its levels, with its customizations. */
type ProjectedFeat = Feat & {
  aptitudeId: string;
  characterLevelId: string;
  klassLevelFeatId?: string;
  klassLevelId: string;
  modifiers: Modifier[];
  properties: Property[];
  requirements: Requirement[];
};

/** A power a projection adds at one of its levels: its spell level and its save's name. */
type ProjectedPower = Power & {
  aptitudeId: string;
  characterLevelId: string;
  klassLevelId: string;
  powerLevel: number | null;
  saveName: string | null;
};

/** A skill's ranks a projection adds at one of its levels. */
type ProjectedSkill = Skill & {
  characterLevelId: string;
  klassLevelId: string;
  rank: number;
};

/** A view map's rows. */
type RowOf<M> = M extends Map<string, infer T> ? T : never;

/** A feat picked in a pool. */
export type FeatPick = { aptitudeId: string; featId: string };

/** A class level's granted feats, as the view joins them to their feats. */
export type GrantedFeatRecords = RowOf<RulesetData["klassLevelFeatsWithFeatsByKlassLevel"]>;

/** A level's selections, checked: the rows picked, the pool each is picked in, and each power's spell level there. */
export interface PickedRows {
  featToAptitude: Map<string, string>;
  fetchedFeats: RowOf<RulesetData["featsById"]>[];
  fetchedPowers: RowOf<RulesetData["powersById"]>[];
  fetchedSkills: RowOf<RulesetData["skillsById"]>[];
  powerLevelMap: Map<string, number>;
  powerToAptitude: Map<string, string>;
}

/**
 * What a level-up projects onto a character before it's saved (`build`'s `projectedData`): the levels it adds or edits
 * and those it leaves out, and the feats, powers and skill ranks picked or granted at them.
 */
export interface ProjectedCharacterData {
  characterLevels?: ProjectedCharacterLevel[];
  excludeCharacterLevelIds?: string[];
  feats?: ProjectedFeat[];
  givenFeats?: ProjectedFeat[];
  powers?: ProjectedPower[];
  skills?: ProjectedSkill[];
}

/**
 * A level a projection adds, as a saved one is but for its position: a replaced level's stand-in takes the replaced
 * level's, and a new level has none, the loader placing it after the saved levels in the order given.
 */
export type ProjectedCharacterLevel = Omit<CharacterLevel, "position"> & { position?: number };

/**
 * A character from its rows (`character`) with what a level-up adds before it's saved, in a ruleset's view: the levels it
 * adds, replaces or leaves out, and the feats, powers and skill ranks picked or granted at them. The wizard's steps, the
 * level-up's plans and the pickers build the character with one. It says which character it projects: the character as
 * it was before a level (`dropLevelsFrom`, what a level's prerequisites read), or with a level replaced where it stands
 * (`addLevel`'s `replacing`, what a level's slots and points read).
 */
export default class CharacterProjection {
  constructor(
    private readonly view: RulesetView,
    private readonly character: CharacterInput,
  ) {}

  private readonly droppedLevelIds: string[] = [];

  private readonly feats: ProjectedFeat[] = [];

  private readonly givenFeats: ProjectedFeat[] = [];

  private readonly levels: ProjectedCharacterLevel[] = [];

  private readonly powers: ProjectedPower[] = [];

  private readonly skills: ProjectedSkill[] = [];

  /** A feat's modifiers, properties and requirements, so the projection carries its full effects. */
  private customizationsOf(featId: string) {
    const { modifiersBySource, propertiesByEntity, requirementsByEntity } = this.view.rulesetData;
    return {
      modifiers: modifiersBySource.get(featId) ?? [],
      properties: propertiesByEntity.get(featId) ?? [],
      requirements: requirementsByEntity.get(featId) ?? [],
    };
  }

  /**
   * Adds a level of class level `klassLevelId`, with its ability increase and hit points (ten when not given): after the
   * character's saved levels, or in the place of the level it's `replacing`, which it leaves out. A fresh id keeps it
   * apart from the level it replaces, so the loader doesn't count that level's granted feats twice.
   */
  addLevel(
    klassLevelId: string,
    {
      abilityId,
      hp = 10,
      replacing,
    }: { abilityId?: string | null; hp?: number; replacing?: { id: string; position: number } } = {},
  ) {
    const now = new Date().toISOString();
    const level: ProjectedCharacterLevel = {
      id: crypto.randomUUID(),
      characterId: this.character.record.id,
      klassLevelId,
      hp,
      abilityId: abilityId || null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      ...(replacing && { position: replacing.position }),
    };
    if (replacing) this.droppedLevelIds.push(replacing.id);
    this.levels.push(level);
    return level;
  }

  /** Adds the level-up wizard's pending levels, in order: their class levels, with their ability increases when given. */
  addLevels(klassLevelIds: string[], abilityIds?: (string | undefined)[]) {
    return klassLevelIds.map((klassLevelId, i) => this.addLevel(klassLevelId, { abilityId: abilityIds?.[i] }));
  }

  /**
   * Adds a level's checked selections (`rows`) to it: its skills at their ranks (`skillRanks`), its feats in their pools
   * with their customizations, and its powers at their spell level in their pools.
   */
  addSelections(level: ProjectedCharacterLevel, skillRanks: Record<string, number>, rows: PickedRows) {
    const at = { characterLevelId: level.id, klassLevelId: level.klassLevelId };
    for (const skill of rows.fetchedSkills) this.skills.push({ ...skill, ...at, rank: skillRanks[skill.id] });
    for (const feat of rows.fetchedFeats) {
      const aptitudeId = rows.featToAptitude.get(feat.id)!;
      this.feats.push({ ...feat, ...at, aptitudeId, ...this.customizationsOf(feat.id) });
    }
    for (const power of rows.fetchedPowers) {
      const aptitudeId = rows.powerToAptitude.get(power.id)!;
      const powerLevel = rows.powerLevelMap.get(`${power.id}:${aptitudeId}`) ?? null;
      this.powers.push({ ...power, ...at, aptitudeId, powerLevel, saveName: null });
    }
  }

  /** The character built from its rows with the projection. */
  build(): DetailedCharacter {
    const projected: ProjectedCharacterData = {
      characterLevels: this.levels,
      excludeCharacterLevelIds: this.droppedLevelIds,
      feats: this.feats,
      givenFeats: this.givenFeats,
      powers: this.powers,
      skills: this.skills,
    };
    return CharacterBuilder.build(this.view, this.character, { projected });
  }

  /** Leaves out the character's level `levelId`. */
  dropLevel(levelId: string) {
    this.droppedLevelIds.push(levelId);
  }

  /**
   * Leaves out the character's level `levelId` and every level it took after it: the character as it was before that
   * level. Answers the levels it leaves out, none when the character has no such level.
   */
  dropLevelsFrom(levelId: string) {
    const sorted = this.character.rows.levels.toSorted((a, b) => a.position - b.position);
    const index = sorted.findIndex((level) => level.id === levelId);
    const dropped = index === -1 ? [] : sorted.slice(index).map((level) => level.id);
    this.droppedLevelIds.push(...dropped);
    return dropped;
  }

  /**
   * Grants a level the feats class levels grant (`klassLevelIds`, its own when not given), but those in `except` (the
   * level picks them): each with its modifiers, as the saved character's build gives a granted feat.
   */
  grantFeats(
    level: ProjectedCharacterLevel,
    { except, klassLevelIds = [level.klassLevelId] }: { except?: Set<string>; klassLevelIds?: string[] } = {},
  ) {
    const { klassLevelFeatsWithFeatsByKlassLevel, modifiersBySource } = this.view.rulesetData;
    for (const record of klassLevelIds.flatMap((id) => klassLevelFeatsWithFeatsByKlassLevel.get(id) ?? [])) {
      if (except?.has(record.featsInRule.id)) continue;
      this.givenFeats.push({
        ...record.featsInRule,
        klassLevelId: record.klassLevelId,
        klassLevelFeatId: record.id,
        characterLevelId: level.id,
        aptitudeId: record.aptitudeId,
        modifiers: modifiersBySource.get(record.featsInRule.id) ?? [],
        properties: [],
        requirements: [],
      });
    }
  }

  /** Grants a level the powers its class level grants, at no spell level. */
  grantPowers(level: ProjectedCharacterLevel) {
    const records = this.view.rulesetData.klassLevelPowersWithPowersByKlassLevel.get(level.klassLevelId) ?? [];
    for (const record of records) {
      this.powers.push({
        ...record.powersInRule,
        klassLevelId: level.klassLevelId,
        characterLevelId: level.id,
        aptitudeId: record.aptitudeId,
        powerLevel: null,
        saveName: null,
      });
    }
  }

  /**
   * Adds the feats picked so far (`picks`, each in its pool) to a level, with their customizations. A pick given twice
   * counts once (the wizard can send it as pending and as selected), so its modifiers apply once; the same feat picked
   * in two pools counts in each.
   */
  pickFeats(level: ProjectedCharacterLevel, picks: FeatPick[]) {
    const unique = [...new Map(picks.map((pick) => [`${pick.featId}:${pick.aptitudeId}`, pick])).values()];
    for (const pick of unique) {
      const feat = this.view.rulesetData.featsById.get(pick.featId);
      if (!feat) continue;
      this.feats.push({
        ...feat,
        klassLevelId: level.klassLevelId,
        characterLevelId: level.id,
        aptitudeId: pick.aptitudeId,
        ...this.customizationsOf(feat.id),
      });
    }
  }

  /** Adds skill ranks (`allocations`) to a level: the last rank given for a skill wins. */
  rankSkills(level: ProjectedCharacterLevel, allocations: { rank: number; skillId: string }[]) {
    const rankBySkillId = new Map(allocations.map((allocation) => [allocation.skillId, allocation.rank]));
    for (const [skillId, rank] of rankBySkillId) {
      const skill = this.view.rulesetData.skillsById.get(skillId);
      if (skill) this.skills.push({ ...skill, klassLevelId: level.klassLevelId, characterLevelId: level.id, rank });
    }
  }
}
