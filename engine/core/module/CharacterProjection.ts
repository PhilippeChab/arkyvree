import type { CharacterLevel } from "@/shared/relations.ts";

import type { CharacterInput, CharacterRows } from "./CharacterInputs.ts";
import type { AbilityIncrease, LevelPickRows } from "./parts/levelUp/index.ts";

/**
 * A character's rows (`character`) with what a level-up adds before it's saved, as the rows it would save: the levels
 * it adds, replaces or leaves out, and their ability increases and picks. A ruleset builds the character from them as
 * from saved rows (`input`), so what a level grants, what a pick carries and where a level stands are read one way. It
 * says which character it projects: the character as it was before a level (`dropLevelsFrom`, what a level's
 * prerequisites read), or with a level replaced where it stands (`addLevel`'s `replacing`, what its slots and points
 * read).
 */
export default class CharacterProjection {
  constructor(private readonly character: CharacterInput) {
    this.nextPosition = Math.max(0, ...character.rows.levels.map((level) => level.position)) + 1;
  }

  private readonly droppedLevelIds = new Set<string>();

  private readonly levels: CharacterLevel[] = [];

  private readonly picks: CharacterRows["picks"] = { abilityIncreases: [], feats: [], powers: [], skills: [] };

  /** Where the next level added goes: after every level the character saved, and those added before it. */
  private nextPosition: number;

  /** A row's timestamps, now, as a save would write them. */
  private stamps() {
    const now = new Date().toISOString();
    return { createdAt: now, updatedAt: now, deletedAt: null };
  }

  /**
   * Adds a level of class level `klassLevelId`, with its ability increases and hit points: after the character's
   * levels, or in the place of the level it's `replacing`, which it leaves out. A fresh id keeps it apart from the level
   * it replaces.
   */
  addLevel(
    klassLevelId: string,
    {
      abilityIncreases = [],
      hp,
      replacing,
    }: { abilityIncreases?: AbilityIncrease[]; hp: number; replacing?: { id: string; position: number } },
  ): CharacterLevel {
    if (replacing) this.droppedLevelIds.add(replacing.id);
    const level = {
      id: crypto.randomUUID(),
      characterId: this.character.record.id,
      klassLevelId,
      hp,
      position: replacing ? replacing.position : this.nextPosition++,
      ...this.stamps(),
    };
    this.levels.push(level);
    const at = { characterLevelId: level.id, ...this.stamps() };
    for (const { abilityId, amount } of abilityIncreases)
      this.picks.abilityIncreases.push({ ...at, abilityId, amount });
    return level;
  }

  /** Adds levels of these class levels, in order, with their ability increases (by place) when given. */
  addLevels(klassLevelIds: string[], { abilityIncreases, hp }: { abilityIncreases?: AbilityIncrease[][]; hp: number }) {
    return klassLevelIds.map((klassLevelId, i) =>
      this.addLevel(klassLevelId, { abilityIncreases: abilityIncreases?.[i], hp }),
    );
  }

  /** Leaves out the character's level `levelId`, with its picks. */
  dropLevel(levelId: string) {
    this.droppedLevelIds.add(levelId);
  }

  /**
   * Leaves out the character's level `levelId` and every level it took after it, with their picks: the character as it
   * was before that level. Answers the levels it leaves out, none when the character has no such level.
   */
  dropLevelsFrom(levelId: string) {
    const sorted = this.character.rows.levels.toSorted((a, b) => a.position - b.position);
    const index = sorted.findIndex((level) => level.id === levelId);
    const dropped = index === -1 ? [] : sorted.slice(index).map((level) => level.id);
    for (const id of dropped) this.droppedLevelIds.add(id);
    return dropped;
  }

  /** The character's rows with the projection: its levels but those left out, then those added, and their picks. */
  get input(): CharacterInput {
    const { rows } = this.character;
    const levels = [...rows.levels.filter((level) => !this.droppedLevelIds.has(level.id)), ...this.levels];
    const kept = new Set(levels.map((level) => level.id));
    const keep = <P extends { characterLevelId: string }>(saved: P[], added: P[]) =>
      [...saved, ...added].filter((pick) => kept.has(pick.characterLevelId));
    return {
      ...this.character,
      rows: {
        ...rows,
        levels,
        picks: {
          abilityIncreases: keep(rows.picks.abilityIncreases, this.picks.abilityIncreases),
          feats: keep(rows.picks.feats, this.picks.feats),
          powers: keep(rows.picks.powers, this.picks.powers),
          skills: keep(rows.picks.skills, this.picks.skills),
        },
      },
    };
  }

  /**
   * Adds picks at a level, as the rows a save keeps: one per feat or power and pool (a pick given twice, as the wizard
   * can send it, counts once), and one per skill (the last rank given wins).
   */
  pick(level: { id: string }, { feats = [], powers = [], skills = [] }: Partial<LevelPickRows>) {
    const at = { characterLevelId: level.id, ...this.stamps() };
    const uniqueFeats = new Map(feats.map((pick) => [`${pick.featId}:${pick.aptitudeId}`, pick]));
    for (const { aptitudeId, featId } of uniqueFeats.values()) this.picks.feats.push({ ...at, aptitudeId, featId });
    const uniquePowers = new Map(powers.map((pick) => [`${pick.powerId}:${pick.aptitudeId}`, pick]));
    for (const { aptitudeId, powerId } of uniquePowers.values()) this.picks.powers.push({ ...at, aptitudeId, powerId });
    const ranks = new Map(skills.map((skill) => [skill.skillId, skill.rank]));
    for (const [skillId, rank] of ranks) this.picks.skills.push({ ...at, rank, skillId });
  }
}
