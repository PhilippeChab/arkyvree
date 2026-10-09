import type { RulesetData, RulesetView } from "@/engine/core/view/index.ts";
import type { Requirement } from "@/shared/relations.ts";

/**
 * A picker: what it offers (`filters`, which the server reads a page of options with), and each option of a page
 * described one way (`describe`): the rows as the view reads them, those the picker offers (`offer`), each with whether
 * who it picks for meets the option's requirements (`requirementsOf`, `meets`) and, when not, the tree of those it fails
 * (`describeFailed`), what the picker adds of the option (`detailsOf`), in the picker's order (`order`). A kind says
 * only what differs: what it offers, an option's requirements, who's checked, and what it adds.
 */
export default abstract class Picker<Row extends { id: string }, Details extends object = object> {
  constructor(protected readonly view: RulesetView) {}

  /** What the picker offers, which the server reads a page of options with. */
  abstract readonly filters: object;

  /** The tree of an option's requirement groups that who the picker is for fails, as the client shows it. */
  protected abstract describeFailed(groups: Requirement[][]): string | undefined;

  /** What the picker adds of a page's options, by option: nothing, unless its kind adds some. */
  protected detailsOf(_rows: Row[]): (row: Row) => Details {
    return () => ({}) as Details;
  }

  /** Whether who the picker is for meets an option's requirement groups. */
  protected abstract meets(groups: Requirement[][], row: Row): boolean;

  /** The options of a page the picker offers: every row, unless its kind leaves some out. */
  protected offer(rows: Row[]): Row[] {
    return rows;
  }

  /** The options in the picker's order: the page's, unless its kind orders them. */
  protected order<O extends Row & Details>(options: O[]): O[] {
    return options;
  }

  /** An option's requirement groups: its own, unless its kind adds others. */
  protected requirementsOf(row: Row): Requirement[][] {
    const own = this.rulesetData.requirementsByEntity.get(row.id) ?? [];
    return own.length > 0 ? [own] : [];
  }

  protected get rulesetData(): RulesetData {
    return this.view.rulesetData;
  }

  /**
   * A page's options (`rows`, as the server read them), each with whether who the picker is for may pick it, the tree
   * of the requirements it fails, and what the picker adds of it.
   */
  describe<R extends Row>(rows: R[]): (R & Details & { eligible: boolean; requirementTree?: string })[] {
    // The picker offers a subset of the rows it's handed, of their own type
    const options = this.offer(this.rulesetData.cow.resolveRows(rows)) as R[];
    const details = this.detailsOf(options);
    return this.order(
      options.map((row) => {
        const groups = this.requirementsOf(row);
        const eligible = groups.length === 0 || this.meets(groups, row);
        return {
          ...row,
          eligible,
          ...(!eligible && { requirementTree: this.describeFailed(groups) }),
          ...details(row),
        };
      }),
    );
  }
}
