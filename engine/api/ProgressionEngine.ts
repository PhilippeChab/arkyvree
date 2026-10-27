import type { EntityProgression } from "@/engine/core/entities/index.ts";
import type { ProgressionPlan } from "@/engine/core/module/index.ts";
import type { RulesetView } from "@/engine/core/view/index.ts";

/**
 * The engine bound to an entity's progression (`type`, an owner's kind: a class's levels at once), as its kind's rules
 * answer it (`progression`): what its tabs read, and one save of it.
 */
export default class ProgressionEngine<P extends EntityProgression> {
  constructor(
    private readonly view: RulesetView,
    private readonly type: string,
    private readonly progression: P,
  ) {}

  /** What its tabs read beside its owned entities and tables. */
  describe(): ReturnType<P["describe"]> {
    return this.progression.describe() as ReturnType<P["describe"]>;
  }

  /**
   * One save of it (`sent`), as its kind's rules plan it, with what refuses it when the owner or an owned entity it
   * writes is gone since the view was read, each named in its rules' word: "Class level no longer exists; refresh the
   * class".
   */
  plan(sent: Parameters<P["plan"]>[0]): ReturnType<P["plan"]> & Pick<ProgressionPlan, "gone"> {
    const plan = this.progression.plan(sent) as ReturnType<P["plan"]>;
    const { rulesetData } = this.view;
    const refresh = `refresh the ${rulesetData.labelOf(this.type).toLowerCase()}`;
    const gone = (type: string) => `${rulesetData.labelOf(type)} no longer exists; ${refresh}`;
    return { ...plan, gone: { owned: gone(plan.ownedType), owner: gone(this.type) } };
  }
}
