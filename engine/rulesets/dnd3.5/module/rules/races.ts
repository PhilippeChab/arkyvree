import type { Requirement } from "@/shared/relations.ts";

/** A race's fields its properties hold: whether it walks on four legs, and whether armor and load leave its speed. */
export type RaceFields = { quadruped: boolean; speedIgnoresEncumbrance: boolean };

/** The rules a race follows. */
export interface RacesRules {
  /**
   * Each race, with whether a new character of what its form says (`identity`: its alignment and gender, when given)
   * meets the race's requirements (`requirementsByEntity`): a requirement on what the form doesn't say counts as met.
   */
  enrichWithEligibility<T extends { id: string }>(
    races: T[],
    requirementsByEntity: Map<string, Requirement[]>,
    identity: { alignment?: string; gender?: string },
  ): (T & { eligible: boolean })[];
  readProperties(properties: { type: string; value: string }[]): RaceFields;
}
