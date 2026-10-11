/**
 * The ways a new 3.5 character's ability scores are set, as the SRD gives them, in the order its form offers them:
 * rolled (`dice`: `count` dice of `sides`, the highest `keep` summed), the standard array (`scores`, each to one
 * ability), or a point buy (`costs`, each score's, out of `budget`).
 */
export const CREATION_METHODS = [
  { id: "4d6-drop-lowest", label: "4d6 Drop Lowest", kind: "roll", dice: { count: 4, keep: 3, sides: 6 } },
  { id: "3d6-straight", label: "3d6 Straight", kind: "roll", dice: { count: 3, keep: 3, sides: 6 } },
  { id: "standard-array", label: "Standard Array", kind: "array", scores: [15, 14, 13, 12, 10, 8] },
  {
    id: "point-buy",
    label: "Point Buy",
    kind: "pointBuy",
    budget: 25,
    costs: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 6, 15: 8, 16: 10, 17: 13, 18: 16 },
  },
] as const;
