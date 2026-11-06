/** The core rules' book, the Core Rulebook, which every other book builds on. */
export const CORE_BOOK = "core-rulebook";

/**
 * The books the parser reads, by the slug their references' folder takes, in the order they were published, the core
 * rules' first: an entry a later book reprints is the earliest's.
 */
export const BOOKS = [
  CORE_BOOK,
  "advanced-players-guide",
  "ultimate-magic",
  "ultimate-combat",
  "advanced-race-guide",
  "ultimate-equipment",
  "ultimate-campaign",
  "advanced-class-guide",
  "pathfinder-unchained",
  "occult-adventures",
  "ultimate-intrigue",
  "horror-adventures",
  "adventurers-guide",
  "ultimate-wilderness",
  "planar-adventures",
] as const;
