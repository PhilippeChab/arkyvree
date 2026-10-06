import type { ItemFields } from "@/database/packages/dnd35-from-parser/tools/types/items.ts";
import type { Overrides, ScrapedMeta } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";
import type { Modifier, Property } from "@/database/packages/dnd35/content/customization/types.ts";

/** A magic item's fields an override sets. */
type MagicItemFields = ItemFields & {
  slot?: string;
  baseItem?: string | null;
  modifiers?: Modifier[];
  /** Properties the item adds to those the generator gives it (a composite bow's Strength rating). */
  properties?: Property[];
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

  raw: {
    name: string;
    category: MagicItemCategory;
    description: string;
    metadataText: string;
    spellCharges?: { spell: string; charges: number }[];
  }[];

  detected: Record<
    string,
    {
      category: MagicItemCategory;
      aura?: string;
      casterLevel?: number;
      costGp: string;
      weight: string;
      itemType: string;
      slot: string;
      variant?: string;
      baseItem?: string;
      modifiers?: Modifier[];
      unresolvedModifiers?: string[];
    }
  >;

  overrides?: Overrides<MagicItemFields & { aura?: string; casterLevel?: number }>;
};
