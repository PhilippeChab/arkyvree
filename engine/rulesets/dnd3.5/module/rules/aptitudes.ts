/** The rules a ruleset's aptitudes follow. */
export interface AptitudesRules {
  /**
   * Throws when the ruleset's characters need the aptitude by its name and the change drops it: a rename to `name`, or,
   * without one, a delete.
   */
  validateNameKept(aptitude: { name: string }, name?: string): void;
}
