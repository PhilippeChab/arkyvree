import { type CharacterInput, CharacterProjection, type PlannedSoFar } from "@/engine/core/module/index.ts";
import { CharacterPicker } from "@/engine/core/pickers/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import type DetailedCharacter from "@/engine/rulesets/dnd3.5/model/DetailedCharacter.ts";
import Dnd35CharacterBuilder from "@/engine/rulesets/dnd3.5/model/Dnd35CharacterBuilder.ts";
import LevelRules from "@/engine/rulesets/dnd3.5/rules/LevelRules.ts";
import type { Klass, KlassLevel, Requirement } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

/**
 * The class picker for the character, from its rows and what the level-up wizard plans so far: a player character's
 * classes (`filters`), each the character can take another level of offered with that level and its class's last, and
 * checked with that level added; highest next level first, then by name.
 */
export default class ClassPicker extends CharacterPicker<
  DetailedCharacter,
  Klass,
  { maxLevel: number; nextLevel: number }
> {
  constructor(
    view: RulesetView,
    input: CharacterInput,
    private readonly planned: PlannedSoFar,
  ) {
    super(view, input, Dnd35CharacterBuilder);
  }

  /** What the picker offers: a player character's classes. */
  readonly filters = { kind: "pc" };

  /** The character's highest level in each class it has levels of, by the class's id, once read. */
  private maxLevels?: Map<string, number>;

  /** The class's next level for the character: after its highest in the class. */
  private nextLevelOf(klass: Klass): KlassLevel | undefined {
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

  /** The class's next level, with the class's last. */
  protected override detailsOf() {
    return (klass: Klass) => {
      const next = this.nextLevelOf(klass)!;
      const last = this.rulesetData.klassLevelsByKlass.get(klass.id)?.at(-1)?.level ?? next.level;
      return { nextLevel: next.level, maxLevel: last };
    };
  }

  /** Whether the character meets a class's requirement groups with the class's next level added. */
  protected override meets(groups: Requirement[][], klass: Klass) {
    return this.character.meetsWithNextLevel(stripSeparators(klass.name), this.nextLevelOf(klass)!, groups);
  }

  /** The classes the character can take another level of. */
  protected override offer(klasses: Klass[]) {
    return klasses.filter((klass) => this.nextLevelOf(klass));
  }

  /** Highest next level first, then by name. */
  protected override order<O extends Klass & { nextLevel: number }>(options: O[]) {
    return options.sort((a, b) => b.nextLevel - a.nextLevel || a.name.localeCompare(b.name));
  }

  /**
   * What the level-up wizard plans adds to the character, for the class picker: its planned levels, and its feats and
   * skill ranks picked so far, which requirements read: at the first planned level, or at the character's last level
   * when it plans none.
   */
  protected project() {
    const { abilityIds, featPicks, klassLevelIds = [], skillRanks } = this.planned;
    const projection = new CharacterProjection(this.input);
    const hp = LevelRules.UNROLLED_LEVEL_HP;
    const [first] = projection.addLevels(klassLevelIds, { abilityIds, hp });
    const pickedAt = first ?? this.input.rows.levels.toSorted((a, b) => a.position - b.position).at(-1);
    if (pickedAt) projection.pick(pickedAt, { feats: featPicks, skills: skillRanks });
    return projection;
  }

  /** A class's requirement groups: its own and its next level's. */
  protected override requirementsOf(klass: Klass) {
    return [klass.id, this.nextLevelOf(klass)!.id]
      .map((id) => this.rulesetData.requirementsByEntity.get(id) ?? [])
      .filter((requirements) => requirements.length > 0);
  }
}
