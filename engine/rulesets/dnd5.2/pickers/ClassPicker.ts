import type {
  CharacterInput,
  EntityRecord,
  OptionRow,
  PickerOption,
  StepOption,
  TrackFilters,
} from "@/engine/core/module/index.ts";
import { CharacterPicker } from "@/engine/core/pickers/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import CharacterProjection from "@/engine/rulesets/dnd5.2/levelUp/CharacterProjection.ts";
import type { PlannedSoFar } from "@/engine/rulesets/dnd5.2/levelUp/requests.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd5.2/model/DetailedCharacter.ts";
import Dnd52CharacterBuilder from "@/engine/rulesets/dnd5.2/model/Dnd52CharacterBuilder.ts";
import LevelRules from "@/engine/rulesets/dnd5.2/rules/LevelRules.ts";
import Dnd52View from "@/engine/rulesets/dnd5.2/view/Dnd52View.ts";
import type { KlassLevel } from "@/engine/rulesets/dnd5.2/view/rows.ts";
import type { Requirement } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd5.2/characterKinds.ts";

/** What the class picker adds of a class: its place on its track, as a step's option holds it. */
type TrackDetails = Required<Pick<StepOption, "track">>;

/**
 * The class picker for the character, from its rows and what the level-up wizard plans so far: a player character's
 * classes (`filters`), each the character can take another level of offered with the levels it takes next, in order,
 * and the levels the character has left, and checked with its next level added; highest next level first, then by
 * name. A class's first level's requirements are its multiclass prerequisites (13 in its primary abilities): the
 * character's first level meets none, and a multiclass meets those of the classes it has too, as the SRD 5.2.1's
 * Multiclassing rules ask.
 */
export default class ClassPicker extends CharacterPicker<DetailedCharacter, EntityRecord, TrackDetails> {
  constructor(
    view: RulesetView,
    input: CharacterInput,
    private readonly planned: PlannedSoFar,
  ) {
    super(view, input, Dnd52CharacterBuilder);
  }

  /**
   * The class's place on its track: the levels the character can still take, whatever their classes (`left`, the same
   * for every class), and the class's it takes next, in the order a plan takes them (`positions`:
   * `LevelRules.numberPlannedLevels`, a gap filled first), as many as it has left, up to the class's last. Those the
   * character has count, not those the wizard plans, which a plan numbers in its place.
   */
  protected override detailsOf() {
    const left = LevelRules.countLevelsLeft(this.input.rows.advancements.length);
    return (klass: EntityRecord) => ({ track: { left, positions: this.positionsOf(klass, left) } });
  }

  /** Whether the character meets a class's requirement groups with the class's next level added. */
  protected override meets(groups: Requirement[][], klass: EntityRecord) {
    return this.character.meetsWithNextLevel(stripSeparators(klass.name ?? ""), this.nextLevelOf(klass)!, groups);
  }

  /** The classes the character can take another level of. */
  protected override offer(classes: EntityRecord[]) {
    return classes.filter((klass) => this.nextLevelOf(klass));
  }

  /** Highest next level first, then by name. */
  protected override order<O extends EntityRecord & { track: { positions: number[] } }>(options: O[]) {
    const next = (option: O) => option.track.positions[0] ?? 0;
    return options.sort((a, b) => next(b) - next(a) || (a.name ?? "").localeCompare(b.name ?? ""));
  }

  /**
   * What the level-up wizard plans adds to the character, for the class picker: its planned levels, and the feats
   * picked so far, which requirements read: at the first planned level, or at the character's last level when it plans
   * none.
   */
  protected override project() {
    const { classLevelIds = [], picks = [] } = this.planned;
    const projection = new CharacterProjection(this.input);
    const levels = projection.addLevels(classLevelIds, { hp: LevelRules.UNROLLED_LEVEL_HP });
    const pickedAt = levels[0] ?? this.input.rows.advancements.toSorted((a, b) => a.position - b.position).at(-1);
    if (pickedAt) {
      projection.pick(
        pickedAt,
        picks.filter(({ step }) => step === "feats"),
      );
    }
    return projection.input;
  }

  /**
   * A class's requirement groups: its own, and its next level's (counted after the character's levels and those the
   * plan takes before it) but at the character's first level (a class's first level's, its multiclass prerequisites,
   * which a first class doesn't meet); taking a new class, the first levels' of the classes it has too (their
   * prerequisites, which a multiclass meets in its current classes as in its new one).
   */
  protected override requirementsOf(klass: EntityRecord) {
    const levelIds = this.levelIds();
    const first = levelIds.length === 0;
    // The class's next level after the character's levels and the plan's before this one
    const levels = levelIds.map((entryId) => ({ entryId }));
    const position = LevelRules.findNextClassLevel(this.dnd52.classLevelsById, levels, klass.id);
    const next = this.dnd52.classLevelByClassAndLevel.get(`${klass.id}:${position}`);
    const held = position === 1 ? this.heldFirstLevelIds(levelIds) : [];
    return [klass.id, ...(first || !next ? [] : [next.id]), ...held]
      .map((id) => this.rulesetData.requirementsByEntity.get(id) ?? [])
      .filter((requirements) => requirements.length > 0);
  }

  /** A class as the step's option: with its place on its track. */
  protected override stepOptionOf(option: PickerOption<OptionRow, TrackDetails>) {
    return { ...super.stepOptionOf(option), track: option.track };
  }

  /**
   * What the picker offers, a player character's classes (their partition, `pc`), and the order the server pages them
   * in: the character's own classes first (`firstIds`), as a page orders them (`order`: highest next level first, then
   * by name), the others after them by name, each next at its first level, as a class whose first the character skipped
   * is too.
   */
  override get filters(): TrackFilters {
    const { classesById, classLevelsById } = this.dnd52;
    // Each class the character's levels are of, as the view resolves it (a copy for its source), once
    const held = new Map(
      this.input.rows.advancements.flatMap(({ entryId }) => {
        const ownerId = classLevelsById.get(entryId)?.ownerId;
        const klass = ownerId ? classesById.get(ownerId) : undefined;
        return klass ? [[klass.id, klass] as const] : [];
      }),
    );
    const classes = [...held.values()].map((klass) => ({ ...klass, track: { positions: this.positionsOf(klass, 1) } }));
    const firstIds = this.order(classes.filter((klass) => (klass.track.positions[0] ?? 0) > 1)).map(
      (klass) => klass.id,
    );
    return { partitions: [PLAYER_CHARACTER_KIND], firstIds };
  }

  /** The view's D&D 5th Edition lists and indices. */
  private get dnd52(): Dnd52View {
    return Dnd52View.of(this.rulesetData);
  }

  /** The first levels of the classes the character's levels (`levelIds`, its class levels) are of, each once. */
  private heldFirstLevelIds(levelIds: string[]): string[] {
    const { classLevelByClassAndLevel, classLevelsById } = this.dnd52;
    const classIds = new Set(levelIds.flatMap((id) => classLevelsById.get(id)?.ownerId ?? []));
    return [...classIds].flatMap((classId) => classLevelByClassAndLevel.get(`${classId}:1`)?.id ?? []);
  }

  /** The class levels of the character's levels: those it saved, then those the wizard plans. */
  private levelIds(): string[] {
    return [...this.input.rows.advancements.map(({ entryId }) => entryId), ...(this.planned.classLevelIds ?? [])];
  }

  /**
   * The class's next level for the character (`LevelRules.findNextClassLevel`): its lowest the character doesn't hold,
   * none when the class has no more.
   */
  private nextLevelOf(klass: EntityRecord): KlassLevel | undefined {
    const next = LevelRules.findNextClassLevel(this.dnd52.classLevelsById, this.input.rows.advancements, klass.id);
    return this.dnd52.classLevelByClassAndLevel.get(`${klass.id}:${next}`);
  }

  /**
   * The class's levels the character takes next (`count` of them at most), in the order a plan takes them
   * (`LevelRules.numberPlannedLevels`), those the class has: none past its last.
   */
  private positionsOf(klass: EntityRecord, count: number) {
    const { classLevelByClassAndLevel, classLevelsById } = this.dnd52;
    const numbered = LevelRules.numberPlannedLevels(
      classLevelsById,
      this.input.rows.advancements,
      Array.from({ length: count }, () => klass.id),
    );
    const past = numbered.findIndex((position) => !classLevelByClassAndLevel.has(`${klass.id}:${position}`));
    return past === -1 ? numbered : numbered.slice(0, past);
  }
}
