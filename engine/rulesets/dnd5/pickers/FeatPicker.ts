import type {
  CharacterInput,
  OptionGroupRow,
  PickFilters,
  PickGroupFilters,
  StepOptionGroup,
} from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import FeatEntity from "@/engine/rulesets/dnd5/entities/feats/FeatEntity.ts";
import type { FeatPickQuery } from "@/engine/rulesets/dnd5/levelUp/requests.ts";
import FeatsPaths from "@/engine/rulesets/dnd5/model/feats/FeatsPaths.ts";
import FeatRules from "@/engine/rulesets/dnd5/rules/FeatRules.ts";
import Dnd5View from "@/engine/rulesets/dnd5/view/Dnd5View.ts";
import type { Requirement } from "@/shared/relations.ts";
import { FEAT_SELECTABLE } from "@/vocabulary/dnd5/fields/index.ts";

import LevelPicker from "./LevelPicker.ts";

/**
 * A feat picker for the character, from its rows: the pool's feats (`filters`, a family's variants when the query names
 * one; `groupFilters`, grouped by family), but those that don't stack it holds (`holder`: picked or granted at any of its
 * levels, a later one and a planned one too, or made possessed by its modifiers, the feats' and spells' picked so far
 * too), or picked so far; a family's row described when the picker opens it (`describeGroups`). A feat that requires
 * another not possessed (a version of a feat taken once) is checked against that holder too: an edited level's picker
 * offers Grappler (Dexterity) as not eligible beside a later level's Grappler (Strength), as the save refuses it.
 */
export default class FeatPicker extends LevelPicker {
  constructor(view: RulesetView, input: CharacterInput, query: FeatPickQuery) {
    super(view, input, query);
    const heldIds = new Set(this.holder.getHeldFeats().map(({ entity }) => entity.id));
    const rules = FeatRules.of(this.rulesetData);
    const ids = Dnd5View.of(this.rulesetData).listFeatIds(query.aptitudeId);
    const offered = {
      // A feat a character picks is a selectable one
      fields: { [FEAT_SELECTABLE]: true },
      ids,
      // Those it can't take again: one that doesn't stack it holds
      excludeIds: [...new Set([...heldIds, ...ids])].filter((featId) => !rules.canTake(featId, heldIds)),
    };
    const groups = this.feats.groupByFamily(offered.ids);
    // A family's feats are those its row groups, so the row counts what it opens to
    const { family } = query;
    const members = family && groups.filter(({ group }) => group === family).map(({ id }) => id);
    this.filters = members ? { ...offered, ids: members } : offered;
    this.groupFilters = { ...offered, groups };
  }

  /**
   * Each group's top-level conditions that a feat isn't possessed (`feats.<slug>.possessed` false), the groups with
   * none left out: Grappler (Dexterity)'s no Grappler (Strength).
   */
  private static notPossessed(groups: Requirement[][]): Requirement[][] {
    return groups
      .map((group) =>
        group.filter(
          ({ level, operator, target, value }) =>
            !level.includes(".") &&
            operator === "equal" &&
            value === "false" &&
            target !== null &&
            FeatsPaths.parsePossessed(target) !== undefined,
        ),
      )
      .filter((group) => group.length > 0);
  }

  /** The feats' rules: the families a feat is grouped in. */
  private readonly feats = new FeatEntity(this.view);

  /** What the picker offers, the variants it groups under a family when the query names one, and what it leaves out. */
  override readonly filters: PickFilters;

  /** What the picker offers grouped by family: its feats, and the family each of them is grouped in. */
  readonly groupFilters: PickGroupFilters;

  /** The tree of what a feat fails: the character's requirements, else the feats the holder has that it requires not. */
  protected override describeFailed(groups: Requirement[][]) {
    if (!this.character.areRequirementsMet(groups)) return super.describeFailed(groups);
    return FeatPicker.notPossessed(groups)
      .map((group) => this.holder.formatRequirements(group))
      .join("\n");
  }

  /**
   * Whether the character meets a feat's requirements, and the holder (with its every level) those that a feat isn't
   * possessed: a later level's Grappler (Strength) refuses Grappler (Dexterity).
   */
  protected override meets(groups: Requirement[][], row: { id: string }) {
    return super.meets(groups, row) && this.holder.areRequirementsMet(FeatPicker.notPossessed(groups));
  }

  /**
   * A page of the grouped feat options as the step's: a feat without variants described as a flat option is, a
   * family's row eligible, its variants described when the picker opens it.
   */
  describeGroups(rows: OptionGroupRow[]): StepOptionGroup[] {
    const singles = rows.filter((row) => row.count === 1);
    const described = new Map(this.describeOptions(singles).map((option) => [option.id, option]));
    return rows.map(({ count, description, group, id, name }) => {
      const option = count === 1 ? described.get(id) : undefined;
      const eligible = option?.eligible ?? true;
      const requirementTree = eligible ? undefined : option?.requirementTree;
      return { count, description, eligible, group, id, name, ...(requirementTree && { requirementTree }) };
    });
  }
}
