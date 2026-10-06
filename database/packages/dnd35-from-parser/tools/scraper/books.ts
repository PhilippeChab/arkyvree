/**
 * Map internal book slugs to dndtools.net URL slugs.
 *
 * dndtools.net uses `{book-name}--{id}` in URLs. This module centralises
 * those mappings so every parser can resolve a book slug to its URL component.
 */

const BASE_URL = "https://dndtools.net";

const BOOK_SLUGS: Record<string, string> = {
  srd: "players-handbook-v35--6",
  "complete-warrior": "complete-warrior--61",
  "complete-divine": "complete-divine--56",
  "complete-arcane": "complete-arcane--55",
  "complete-adventurer": "complete-adventurer--54",
  "complete-scoundrel": "complete-scoundrel--60",
  dmg: "dungeon-masters-guide-v35--4",
};

export function buildListingUrl(type: "classes" | "feats" | "spells", book: string): string {
  return `${BASE_URL}/${type}/${getBookSlug(book)}/`;
}

export function buildRaceListingUrl(book: string): string {
  const slug = getBookSlug(book);
  const match = slug.match(/--(\d+)$/);
  if (!match) throw new Error(`Could not extract book ID from slug "${slug}"`);
  return `${BASE_URL}/races/?rulebook=${match[1]}`;
}

export function getBookSlug(book: string): string {
  const slug = BOOK_SLUGS[book];
  if (!slug) {
    const known = Object.keys(BOOK_SLUGS).join(", ");
    throw new Error(`Unknown book "${book}". Known books: ${known}`);
  }
  return slug;
}

export { BASE_URL };
