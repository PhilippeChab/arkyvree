import type {
  CharacterInput,
  OptionGroupRow,
  PickFilters,
  PickGroupFilters,
  StepOptionGroup,
} from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";
import FeatEntity from "@/engine/rulesets/dnd3.5/entities/feats/FeatEntity.ts";
import type { FeatPickQuery } from "@/engine/rulesets/dnd3.5/levelUp/requests.ts";
import FeatRules from "@/engine/rulesets/dnd3.5/rules/FeatRules.ts";
import Dnd35View from "@/engine/rulesets/dnd3.5/view/Dnd35View.ts";
import { FEAT_SELECTABLE } from "@/vocabulary/dnd3.5/fields/index.ts";

import LevelPicker from "./LevelPicker.ts";

/**
 * A feat picker for the character, from its rows: the pool's feats (`filters`, a family's variants when the query names
 * one; `groupFilters`, grouped by family), but those that don't stack it holds (`holder`: picked or granted at any of its
 * levels, a later one and a planned one too, or made possessed by its modifiers, the feats' and spells' picked so far
 * too), or picked so far; a family's row described when the picker opens it (`describeGroups`).
 */
export default class FeatPicker extends LevelPicker {
  constructor(view: RulesetView, input: CharacterInput, query: FeatPickQuery) {
    super(view, input, query);
    const heldIds = new Set(this.holder.getHeldFeats().map(({ entity }) => entity.id));
    const rules = FeatRules.of(this.rulesetData);
    const offered = {
      // A feat a character picks is a selectable one
      fields: { [FEAT_SELECTABLE]: true },
      ids: Dnd35View.of(this.rulesetData).listFeatIds(query.aptitudeId),
      excludeIds: [...heldIds].filter((featId) => !rules.canTake(featId, heldIds)),
    };
    const groups = this.feats.groupByFamily(offered.ids);
    // A family's feats are those its row groups, so the row counts what it opens to
    const members = groups.filter(({ group }) => group === query.family).map(({ id }) => id);
    this.filters = query.family ? { ...offered, ids: members } : offered;
    this.groupFilters = { ...offered, groups };
  }

  /** The feats' rules: the families a feat is grouped in. */
  private readonly feats = new FeatEntity(this.view);

  /** What the picker offers, the variants it groups under a family when the query names one, and what it leaves out. */
  override readonly filters: PickFilters;

  /** What the picker offers grouped by family: its feats, and the family each of them is grouped in. */
  readonly groupFilters: PickGroupFilters;

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
