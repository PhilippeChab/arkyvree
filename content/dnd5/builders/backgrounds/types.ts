import type { Modifier } from "@/content/core/builders/customization/types.ts";

/**
 * A background as its seed gives it: its name and description, and its modifiers: its Origin feat, its skill and tool
 * proficiencies granted, and a pick in its ability scores' pool, whose feats are its ways to spread its increases.
 */
export interface BackgroundSeed {
  description: string;
  modifiers: Modifier[];
  name: string;
}
