import { isTemplateValue } from "@/shared/customization/templateExpression.ts";
import type { Requirement } from "@/shared/relations.ts";

/** What an owner's conditions are for: what it takes to have it (`need`), or when one of its bonuses applies (`gate`). */
type ConditionMode = "gate" | "need";

/**
 * One owner's conditions (`rows`: an entity's, or a modifier's own) once some of them name something gone. What an
 * entity needs (`need`) is dropped with what it names: the condition goes, and a group it leaves empty with it. When
 * a bonus applies (`gate`) reads what's gone as absent: a condition that holds of an entity nobody has (not having
 * it, none of it) is met, so it goes, and any "or" it sat in with it; one that can't hold fails its "or" branch, or,
 * under an "and" or at the top, the whole gate, and the bonus with it.
 */
export default class GoneConditions {
  constructor(
    private readonly rows: readonly Requirement[],
    private readonly mode: ConditionMode,
  ) {
    this.groups = new Map(rows.filter((row) => row.chainingOperator !== null).map((row) => [row.level, row]));
  }

  /** Whether a condition holds of an entity nobody has: none of it, not possessed, an empty name. */
  private static isMetWhenAbsent({ operator, value, valueType }: Requirement): boolean {
    if (value === null || isTemplateValue(value)) return false;
    if (valueType === "number") {
      const given = Number(value);
      if (operator === "equal") return given === 0;
      if (operator === "not_equal") return given !== 0;
      if (operator === "less_than") return given > 0;
      if (operator === "less_than_or_equal") return given >= 0;
      if (operator === "greater_than") return given < 0;
      return operator === "greater_than_or_equal" && given <= 0;
    }
    const empty = valueType === "boolean" ? "false" : "";
    if (operator === "equal") return value === empty;
    if (operator === "not_equal") return value !== empty;
    // Nothing contains or matches what isn't there
    return operator === "is_empty" || operator === "not_contains" || operator === "not_matches_regex";
  }

  private static parentLevelOf(level: string): string | null {
    const dot = level.lastIndexOf(".");
    return dot === -1 ? null : level.slice(0, dot);
  }

  private readonly groups: ReadonlyMap<string, Requirement>;

  private readonly removed = new Set<string>();

  private failed = false;

  /** A condition that asks nothing any more goes, and so does a group it leaves with nothing under it. */
  private drop(row: Requirement) {
    this.remove(row);
    const parent = this.parentOf(row);
    if (parent && !this.hasChildren(parent)) this.drop(parent);
  }

  /** A condition that can't hold fails its "or" branch, or everything "and"-ed with it: the gate, at the top. */
  private fail(row: Requirement) {
    const parent = this.parentOf(row);
    if (!parent) {
      this.failed = true;
      this.remove(row);
    } else if (parent.chainingOperator === "or") {
      this.remove(row);
      if (!this.hasChildren(parent)) this.fail(parent);
    } else {
      this.fail(parent);
    }
  }

  private hasChildren(group: Requirement): boolean {
    return this.rows.some(
      (row) => !this.removed.has(row.id) && GoneConditions.parentLevelOf(row.level) === group.level,
    );
  }

  /** A condition that holds goes; an "or" it sat in holds with it, and an "and" it leaves empty does too. */
  private meet(row: Requirement) {
    const parent = this.parentOf(row);
    if (parent?.chainingOperator === "or") {
      this.meet(parent);
      return;
    }
    this.remove(row);
    if (parent && !this.hasChildren(parent)) this.meet(parent);
  }

  private parentOf(row: Requirement): Requirement | undefined {
    const level = GoneConditions.parentLevelOf(row.level);
    return level === null ? undefined : this.groups.get(level);
  }

  /** Removes a row and everything under it. */
  private remove(row: Requirement) {
    for (const other of this.rows)
      if (other.id === row.id || other.level.startsWith(`${row.level}.`)) this.removed.add(other.id);
  }

  /** The conditions left once those that name something gone (`gone`) are settled, and whether the gate fails. */
  settle(gone: readonly Requirement[]): { failed: boolean; rows: Requirement[] } {
    for (const row of gone) {
      if (this.removed.has(row.id)) continue;
      if (this.mode === "need") this.drop(row);
      else if (GoneConditions.isMetWhenAbsent(row)) this.meet(row);
      else this.fail(row);
    }
    return { failed: this.failed, rows: this.rows.filter((row) => !this.removed.has(row.id)) };
  }
}
