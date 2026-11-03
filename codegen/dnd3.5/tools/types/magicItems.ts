import type { Modifier } from "@/content/core/builders/customization/types.ts";
import type { Dnd35ItemSeed } from "@/content/dnd3.5/builders/items/types.ts";

import type { ItemFields } from "./items.ts";
import type { Overrides, ScrapedMeta } from "./reference.ts";

/** A magic item's fields an override sets. */
type MagicItemFields = ItemFields & {
  baseItem?: string | null;
  /** Fields the item has over those the generator gives it (a composite bow's Strength rating). */
  fields?: Dnd35ItemSeed["fields"];
  modifiers?: Modifier[];
  slot?: string;
  /**
   * A specific armor others are made from, as its base armor is: elven chain, whose proficiency is its own (light), not
   * its base's. Its fields are its base armor's, its own over them.
   */
  template?: boolean;
};

export interface MagicItemReference {
  _meta: Omit<ScrapedMeta<"magicItem">, "sourceUrl"> & { sourceUrls: Record<string, string> };

  detected: Record<
    string,
    {
      aura?: string;
      baseItem?: string;
      casterLevel?: number;
      category: MagicItemCategory;
      costGp: number;
      /** Invalid paths that failed validation — bugs to fix */
      errors?: string[];
      itemType: string;
      modifiers?: Modifier[];
      slot: string;
      unresolvedModifiers?: string[];
      variant?: string;
      weight: number;
    }
  >;

  /**
   * Each magic item as the seeds make it, its overrides applied: its base item, cost, description, modifiers (its
   * enhancement's too), fields (its aura's, its caster level's, its stats' and its override's), slot and weight
   * (none when it weighs what its base item does), and whether it's a template or skipped
   */
  mapping: Record<
    string,
    {
      baseItem?: string;
      costGp: number;
      description: string;
      fields: NonNullable<Dnd35ItemSeed["fields"]>;
      modifiers: Modifier[];
      skip?: boolean;
      slot?: string;
      template?: boolean;
      weight?: number;
    }
  >;

  overrides?: Overrides<MagicItemFields & { aura?: string; casterLevel?: number }>;

  raw: {
    category: MagicItemCategory;
    description: string;
    metadataText: string;
    name: string;
    spellCharges?: { charges: number; spell: string }[];
  }[];
}

export type MagicItemCategory =
  | "specificArmor"
  | "specificShield"
  | "specificWeapon"
  | "wondrousItem"
  | "ring"
  | "rod"
  | "staff";
