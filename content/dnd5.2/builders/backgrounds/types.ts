import type { Modifier } from "@/content/core/builders/customization/types.ts";

/**
 * A background as its seed gives it: its name and description, its three abilities (its `abilityScore` links, by
 * name), and its modifiers: its Origin feat, its skill and tool proficiencies granted, and a pick in its ability
 * scores' pool, whose feats are its ways to spread its increases.
 */
export interface BackgroundSeed {
  abilities: string[];
  description: string;
  modifiers: Modifier[];
  name: string;
}
