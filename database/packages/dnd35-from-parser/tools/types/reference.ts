/** What every reference holds: its scraped `_meta`, its overrides, the texts it names. */

import type { Modifier } from "@/database/packages/dnd35/content/customization/types.ts";

/**
 * A domain's or a race's detected modifiers, the invalid paths (bugs to fix) and the text that couldn't be parsed (to
 * review). Their modifiers have no requirements: only a feat's has.
 */
export type DetectedModifiers = { modifiers: Modifier[]; errors?: string[]; unresolvedModifiers?: string[] };

/** A named piece of text: a race's trait, a class feature's sub-option. */
export type NamedText = { name: string; description: string };

/**
 * A reference's overrides (corrections made by hand, stored in its file and kept across re-scrapes) by entry name,
 * and the entries reviewed (no further action needed).
 */
export type Overrides<T> = Record<string, T> & { reviewed?: string[] };

/** Where and when a reference was scraped. */
export type ScrapedMeta<T extends string> = { type: T; sourceUrl: string; book: string; scrapedAt: string };
