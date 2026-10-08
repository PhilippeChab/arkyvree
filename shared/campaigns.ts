/** How much of a character its campaign's other members see, as its player links it. */
export type CharacterVisibility = (typeof CHARACTER_VISIBILITY_OPTIONS)[number];

/**
 * The visibilities a campaign's character is linked with, the column's check (`player_characters_visibility_check`),
 * which tests/shared/campaigns.test.ts holds them to: hidden from the other players, shown whole, or its identity only.
 */
export const CHARACTER_VISIBILITY_OPTIONS = ["Private", "Public", "Partial"] as const;
