import type { CharacterInput, OpenedTrackPicker } from "@/engine/core/module/index.ts";
import { CharacterPicker } from "@/engine/core/pickers/index.ts";
import type { EntityRow, KlassLevel, RulesetView } from "@/engine/core/view/index.ts";
import CharacterProjection from "@/engine/rulesets/dnd3.5/levelUp/CharacterProjection.ts";
import type LevelUpPlan from "@/engine/rulesets/dnd3.5/levelUp/LevelUpPlan.ts";
import type { PlannedSoFar } from "@/engine/rulesets/dnd3.5/levelUp/requests.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35CharacterBuilder from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import type { Requirement } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

/**
 * The class picker for the character, from its rows and what the level-up wizard plans so far: a player character's
 * classes (`filters`), each the character can take another level of offered with that level, its class's last, and the
 * levels the character has left, and checked with that level added; highest next level first, then by name. The skill
 * points spent so far go on the planned levels as a save would spread them (`plan`).
 */
export default class ClassPicker
  extends CharacterPicker<DetailedCharacter, EntityRow, { track: { last: number; left: number; next: number } }>
  implements OpenedTrackPicker<{ columns: { kind: string } }, EntityRow>
{
  constructor(
    view: RulesetView,
    input: CharacterInput,
    private readonly planned: PlannedSoFar,
    private readonly plan: LevelUpPlan,
  ) {
    super(view, input, Dnd35CharacterBuilder);
  }

  /** What the picker offers: a player character's classes. */
  override readonly filters = { columns: { kind: "pc" } };

  /** Its options are classes, each a track. */
  readonly tracks = true;

  /** The character's highest level in each class it has levels of, by the class's id, once read. */
  private maxLevels?: Map<string, number>;

  /**
   * The class's place on its track: its next level, its last, and the levels the character can still take, whatever
   * their classes (`left`, the same for every class): those it has count, not those the wizard plans, which a plan
   * counts.
   */
  protected override detailsOf() {
    const left = LevelRules.countLevelsLeft(this.input.rows.levels.length);
    return (klass: EntityRow) => {
      const next = this.nextLevelOf(klass)!;
      const last = this.rulesetData.klassLevelsByKlass.get(klass.id)?.at(-1)?.level ?? next.level;
      return { track: { last, left, next: next.level } };
    };
  }

  /** Whether the character meets a class's requirement groups with the class's next level added. */
  protected override meets(groups: Requirement[][], klass: EntityRow) {
    return this.character.meetsWithNextLevel(stripSeparators(klass.name), this.nextLevelOf(klass)!, groups);
  }

  /** The classes the character can take another level of. */
  protected override offer(klasses: EntityRow[]) {
    return klasses.filter((klass) => this.nextLevelOf(klass));
  }

  /** Highest next level first, then by name. */
  protected override order<O extends EntityRow & { track: { next: number } }>(options: O[]) {
    return options.sort((a, b) => b.track.next - a.track.next || a.name.localeCompare(b.name));
  }

  /**
   * What the level-up wizard plans adds to the character, for the class picker: its planned levels, the skill points
   * spent so far, each planned level's as a save spreads them, and the feats picked so far, which requirements read: at
   * the first planned level, or at the character's last level when it plans none.
   */
  protected override project() {
    const { abilityIncreases, featPicks, klassLevelIds = [] } = this.planned;
    const projection = new CharacterProjection(this.input);
    const hp = LevelRules.UNROLLED_LEVEL_HP;
    const levels = projection.addLevels(klassLevelIds, { abilityIncreases, hp });
    for (const [i, skills] of this.plan.spreadSkillPoints(this.planned).entries())
      projection.pick(levels[i], { skills });
    const pickedAt = levels[0] ?? this.input.rows.levels.toSorted((a, b) => a.position - b.position).at(-1);
    if (pickedAt) projection.pick(pickedAt, { feats: featPicks });
    return projection.input;
  }

  /** A class's requirement groups: its own and its next level's. */
  protected override requirementsOf(klass: EntityRow) {
    return [klass.id, this.nextLevelOf(klass)!.id]
      .map((id) => this.rulesetData.requirementsByEntity.get(id) ?? [])
      .filter((requirements) => requirements.length > 0);
  }

  /** The class's next level for the character: after its highest in the class. */
  private nextLevelOf(klass: EntityRow): KlassLevel | undefined {
    this.maxLevels ??= this.readMaxLevels();
    return this.rulesetData.klassLevelByKlassAndLevel.get(`${klass.id}:${(this.maxLevels.get(klass.id) || 0) + 1}`);
  }

  /** The character's highest level in each class it has levels of, by the class's id. */
  private readMaxLevels() {
    const maxLevels = new Map<string, number>();
    for (const level of this.input.rows.levels) {
      const klassLevel = this.rulesetData.klassLevelsById.get(level.klassLevelId);
      if (klassLevel)
        maxLevels.set(klassLevel.klassId, Math.max(maxLevels.get(klassLevel.klassId) ?? 0, klassLevel.level));
    }
    return maxLevels;
  }
}
