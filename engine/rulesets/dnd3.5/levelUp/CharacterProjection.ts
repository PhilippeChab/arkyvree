import type {
  AdvancementPlan,
  CharacterInput,
  CharacterPicks,
  PickPlan,
  StoredAdvancement,
  StoredPick,
} from "@/engine/core/module/index.ts";

import type { AbilityIncrease, PlannedSoFar } from "./requests.ts";

/**
 * A character's rows (`character`) with what a level-up adds before it's saved, as the rows it would save: the
 * advancements it adds, replaces or leaves out, and their picks (their hit points, ability increases, skill ranks,
 * feats and spells). The flows build the character from them as from saved rows (`input`), so what a level grants,
 * what a pick carries and where a level stands are read one way. It says which character it projects: the character as
 * it was before a level (`dropLevelsFrom`, what a level's prerequisites read), or with a level replaced where it stands
 * (`addLevel`'s `replacing`, what its slots and points read).
 */
export default class CharacterProjection {
  constructor(private readonly character: CharacterInput) {
    this.nextPosition = Math.max(0, ...character.rows.advancements.map((level) => level.position)) + 1;
  }

  /** The feats and spells a plan picked so far (`planned`), each in its pool, as picks a save writes. */
  static picksOf({ featPicks = [], spellPicks = [] }: Pick<PlannedSoFar, "featPicks" | "spellPicks">): PickPlan[] {
    return [
      ...featPicks.map(({ aptitudeId, featId }) => ({ step: "feats", entityId: featId, viaId: aptitudeId })),
      ...spellPicks.map(({ aptitudeId, spellId }) => ({ step: "spells", entityId: spellId, viaId: aptitudeId })),
    ];
  }

  private readonly advancements: StoredAdvancement[] = [];

  private readonly droppedLevelIds = new Set<string>();

  private readonly picks: CharacterPicks = {};

  /** Where the next level added goes: after every level the character saved, and those added before it. */
  private nextPosition: number;

  /** Adds a pick at an advancement (`advancementId`), as a save writes it. */
  private add(advancementId: string, { amount, entityId, step, viaId }: PickPlan) {
    const pick: StoredPick = {
      id: crypto.randomUUID(),
      advancementId,
      entityId: entityId ?? null,
      viaId: viaId ?? null,
      amount: amount ?? null,
      ...this.stamps(),
    };
    (this.picks[step] ??= []).push(pick);
  }

  /**
   * Adds an advancement in a track (`trackId`: a class level): after the character's levels, or in the place of the
   * level it's `replacing`, which it leaves out. A fresh id keeps it apart from the level it replaces.
   */
  private place(trackId: string, replacing?: { id: string; position: number }): StoredAdvancement {
    if (replacing) this.droppedLevelIds.add(replacing.id);
    const level = {
      id: crypto.randomUUID(),
      characterId: this.character.record.id,
      trackId,
      position: replacing ? replacing.position : this.nextPosition++,
      ...this.stamps(),
      deletedAt: null,
    };
    this.advancements.push(level);
    return level;
  }

  /** A row's timestamps, now, as a save would write them. */
  private stamps() {
    const now = new Date().toISOString();
    return { createdAt: now, updatedAt: now };
  }

  /**
   * Adds an advancement as a save writes it (`plan`: its class level, and its picks, its hit points and ability
   * increases among them), after the character's levels.
   */
  addAdvancement({ picks, trackId }: AdvancementPlan): StoredAdvancement {
    const level = this.place(trackId);
    for (const pick of picks) this.add(level.id, pick);
    return level;
  }

  /**
   * Adds a level of class level `klassLevelId`, with its ability increases and hit points: after the character's
   * levels, or in the place of the level it's `replacing`, which it leaves out.
   */
  addLevel(
    klassLevelId: string,
    {
      abilityIncreases = [],
      hp,
      replacing,
    }: { abilityIncreases?: AbilityIncrease[]; hp: number; replacing?: { id: string; position: number } },
  ): StoredAdvancement {
    const level = this.place(klassLevelId, replacing);
    this.add(level.id, { step: "hp", amount: hp });
    for (const { abilityId, amount } of abilityIncreases)
      this.add(level.id, { step: "abilities", entityId: abilityId, amount });
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
    const sorted = this.character.rows.advancements.toSorted((a, b) => a.position - b.position);
    const index = sorted.findIndex((level) => level.id === levelId);
    const dropped = index === -1 ? [] : sorted.slice(index).map((level) => level.id);
    for (const id of dropped) this.droppedLevelIds.add(id);
    return dropped;
  }

  /**
   * The character's rows with the projection: its advancements but those left out, then those added, and their picks,
   * each step's saved ones then those added.
   */
  get input(): CharacterInput {
    const { rows } = this.character;
    const advancements = [
      ...rows.advancements.filter((level) => !this.droppedLevelIds.has(level.id)),
      ...this.advancements,
    ];
    const kept = new Set(advancements.map((level) => level.id));
    const steps = new Set([...Object.keys(rows.picks), ...Object.keys(this.picks)]);
    const picks = Object.fromEntries(
      [...steps].map((step) => [
        step,
        [...(rows.picks[step] ?? []), ...(this.picks[step] ?? [])].filter((pick) => kept.has(pick.advancementId)),
      ]),
    );
    return { ...this.character, rows: { ...rows, advancements, picks } };
  }

  /**
   * Adds picks at a level (`picks`, as a save writes them): one per feat or spell picked (a stackable feat picked twice
   * is two), and one per skill (the last rank given wins). What a level can't hold twice, a spell or a non-stackable
   * feat, its caller has refused or dropped (`SelectionChecks`, a preview's fitting).
   */
  pick(level: { id: string }, picks: PickPlan[]) {
    const ranks = new Map<string, PickPlan>();
    for (const pick of picks) {
      if (pick.step === "skills") ranks.set(pick.entityId!, pick);
      else this.add(level.id, pick);
    }
    for (const rank of ranks.values()) this.add(level.id, rank);
  }
}
