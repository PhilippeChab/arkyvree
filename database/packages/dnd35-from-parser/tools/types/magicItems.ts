import type { Modifier, Property } from "@/database/packages/dnd35/content/customization/types.ts";

import type { ItemFields } from "./items.ts";
import type { Overrides, ScrapedMeta } from "./reference.ts";

/** A magic item's fields an override sets. */
type MagicItemFields = ItemFields & {
  baseItem?: string | null;
  modifiers?: Modifier[];
  /** Properties the item adds to those the generator gives it (a composite bow's Strength rating). */
  properties?: Property[];
  slot?: string;
  /**
   * A specific armor others are made from, as its base armor is: elven chain, whose proficiency is its own (light), not
   * its base's. Its properties are its base armor's, its own over them.
   */
  template?: boolean;
};

export type MagicItemCategory =
  | "specificArmor"
  | "specificShield"
  | "specificWeapon"
  | "wondrousItem"
  | "ring"
  | "rod"
  | "staff";

export type MagicItemReference = {
  _meta: Omit<ScrapedMeta<"magicItem">, "sourceUrl"> & { sourceUrls: Record<string, string> };

  detected: Record<
    string,
    {
      aura?: string;
      baseItem?: string;
      casterLevel?: number;
      category: MagicItemCategory;
      costGp: string;
      itemType: string;
      modifiers?: Modifier[];
      slot: string;
      unresolvedModifiers?: string[];
      variant?: string;
      weight: string;
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
};
