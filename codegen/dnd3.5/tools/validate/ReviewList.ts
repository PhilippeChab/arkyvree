/**
 * A reference's review list (`overrides.reviewed`): the entries it has, those that covered an issue (`use`), and, once
 * each, the ones that covered none or are repeated (`stale`).
 */
export class ReviewList {
  constructor(private readonly reviewed: string[] = []) {}

  /** The entries that covered an issue. */
  private readonly used = new Set<string>();

  /** Whether the list has `entry`. */
  has(entry: string): boolean {
    return this.reviewed.includes(entry);
  }

  /** The entries that covered no issue, or repeat one, once each. */
  stale(): string[] {
    return [...new Set(this.reviewed.filter((entry, i) => !this.used.has(entry) || this.reviewed.indexOf(entry) < i))];
  }

  /** `entry` covered an issue. */
  use(entry: string): void {
    this.used.add(entry);
  }
}
