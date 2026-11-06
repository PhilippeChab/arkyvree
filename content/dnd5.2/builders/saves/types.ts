/** A save: its name, what it resists, and the ability it adds (its `keyAbility` link), by its name. */
export interface SaveSeed {
  description: string;
  links: { keyAbility: string };
  name: string;
}
