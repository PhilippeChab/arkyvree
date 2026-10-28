import type { CharacterInput, EntityRecord, OptionRow, PickerOption, StepOption } from "@/engine/core/module/index.ts";
import { CharacterPicker } from "@/engine/core/pickers/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import ClassLevels from "@/engine/rulesets/dnd3.5/characters/ClassLevels.ts";
import CharacterProjection from "@/engine/rulesets/dnd3.5/levelUp/CharacterProjection.ts";
import type LevelUpPlan from "@/engine/rulesets/dnd3.5/levelUp/LevelUpPlan.ts";
import type { PlannedSoFar } from "@/engine/rulesets/dnd3.5/levelUp/requests.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35CharacterBuilder from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import type { KlassLevel } from "@/engine/rulesets/dnd3.5/view/rows.ts";
import type { Requirement } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";
import { PLAYER_CHARACTER_KIND } from "@/vocabulary/dnd3.5/bondedKinds.ts";

/** What the class picker adds of a class: its place on its track, as a step's option holds it. */
type TrackDetails = Required<Pick<StepOption, "track">>;

/**
 * The class picker for the character, from its rows and what the level-up wizard plans so far: a player character's
 * classes (`filters`), each the character can take another level of offered with that level, its class's last, and the
 * levels the character has left, and checked with that level added; highest next level first, then by name. The skill
 * points spent so far go on the planned levels as a save would spread them (`plan`).
 */
export default class ClassPicker extends CharacterPicker<DetailedCharacter, EntityRecord, TrackDetails> {
  constructor(
    view: RulesetView,
    input: CharacterInput,
    private readonly planned: PlannedSoFar,
    private readonly plan: LevelUpPlan,
  ) {
    super(view, input, Dnd35CharacterBuilder);
  }

  /** What the picker offers: a player character's classes (their partition, `pc`). */
  override readonly filters = { partitions: [PLAYER_CHARACTER_KIND] };

  /** The character's level in each class it has levels of, by the class's id, once read. */
  private levelByClass?: Map<string, number>;

  /**
   * The class's place on its track: its next level, its last, and the levels the character can still take, whatever
   * their classes (`left`, the same for every class): those it has count, not those the wizard plans, which a plan
   * counts.
   */
  protected override detailsOf() {
    const left = LevelRules.countLevelsLeft(this.input.rows.advancements.length);
    return (klass: EntityRecord) => {
      const next = this.nextLevelOf(klass)!;
      const last = this.dnd35.classLevelsByClass.get(klass.id)?.at(-1)?.position ?? next.position;
      return { track: { last, left, next: next.position } };
    };
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
  protected override order<O extends EntityRecord & { track: { next: number } }>(options: O[]) {
    return options.sort((a, b) => b.track.next - a.track.next || (a.name ?? "").localeCompare(b.name ?? ""));
  }

  /**
   * What the level-up wizard plans adds to the character, for the class picker: its planned levels, the skill points
   * spent so far, each planned level's as a save spreads them, and the feats picked so far, which requirements read: at
   * the first planned level, or at the character's last level when it plans none.
   */
  protected override project() {
    const { abilityIncreases, classLevelIds = [], picks = [] } = this.planned;
    const projection = new CharacterProjection(this.input);
    const hp = LevelRules.UNROLLED_LEVEL_HP;
    const levels = projection.addLevels(classLevelIds, { abilityIncreases, hp });
    for (const [i, skills] of this.plan.spreadSkillPoints(this.planned).entries()) projection.pick(levels[i], skills);
    const pickedAt = levels[0] ?? this.input.rows.advancements.toSorted((a, b) => a.position - b.position).at(-1);
    if (pickedAt) {
      projection.pick(
        pickedAt,
        picks.filter(({ step }) => step === "feats"),
      );
    }
    return projection.input;
  }

  /** A class's requirement groups: its own and its next level's. */
  protected override requirementsOf(klass: EntityRecord) {
    return [klass.id, this.nextLevelOf(klass)!.id]
      .map((id) => this.rulesetData.requirementsByEntity.get(id) ?? [])
      .filter((requirements) => requirements.length > 0);
  }

  /** A class as the step's option: with its place on its track. */
  protected override stepOptionOf(option: PickerOption<OptionRow, TrackDetails>) {
    return { ...super.stepOptionOf(option), track: option.track };
  }

  /** The view's 3.5 lists and indices. */
  private get dnd35(): Dnd35View {
    return Dnd35View.of(this.rulesetData);
  }

  /** The class's next level for the character: one past its level in the class (`ClassLevels.countByClass`). */
  private nextLevelOf(klass: EntityRecord): KlassLevel | undefined {
    this.levelByClass ??= ClassLevels.countByClass(this.dnd35.classLevelsById, this.input.rows.advancements);
    return this.dnd35.classLevelByClassAndLevel.get(`${klass.id}:${(this.levelByClass.get(klass.id) ?? 0) + 1}`);
  }
}
