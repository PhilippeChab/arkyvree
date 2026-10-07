/** A race's fields its properties hold: whether it walks on four legs, and whether armor and load leave its speed. */
export type RaceFields = { quadruped: boolean; speedIgnoresEncumbrance: boolean };

/** The rules a race follows. */
export interface RacesRules {
  readProperties(properties: { type: string; value: string }[]): RaceFields;
}
