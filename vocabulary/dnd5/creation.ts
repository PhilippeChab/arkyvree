/**
 * The ways a new character's ability scores are generated, as the SRD 5.2.1 gives them, in the order its form offers
 * them: the Standard Array's six scores (`array`), assigned to the abilities; the random generation, four d6 rolled and
 * the highest three summed (`dice`); and the point cost (`costs`, each score's, out of `budget`: 27 points, scores 8 to
 * 15).
 */
export const CREATION_METHODS = [
  { id: "standard-array", label: "Standard Array", kind: "array", scores: [15, 14, 13, 12, 10, 8] },
  { id: "4d6-drop-lowest", label: "4d6 Drop Lowest", kind: "roll", dice: { count: 4, keep: 3, sides: 6 } },
  {
    id: "point-buy",
    label: "Point Buy",
    kind: "pointBuy",
    budget: 27,
    costs: { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 },
  },
] as const;
