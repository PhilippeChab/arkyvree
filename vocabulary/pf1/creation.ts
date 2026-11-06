/**
 * The ways a new Pathfinder character's ability scores are set, as the Core Rulebook gives them, in the order its form
 * offers them: rolled (`dice`: `count` dice of `sides`, the highest `keep` summed: its Standard and Classic methods), or
 * the purchase (`costs`, each score's, a score below 10 refunding points, out of `budget`: a standard fantasy
 * campaign's 15). Its Heroic method (2d6+6) and its dice pool aren't offered: a roll takes no bonus, and no method
 * assigns a pool.
 */
export const CREATION_METHODS = [
  { id: "4d6-drop-lowest", label: "4d6 Drop Lowest", kind: "roll", dice: { count: 4, keep: 3, sides: 6 } },
  { id: "3d6-straight", label: "3d6 Straight", kind: "roll", dice: { count: 3, keep: 3, sides: 6 } },
  {
    id: "point-buy",
    label: "Point Buy",
    kind: "pointBuy",
    budget: 15,
    costs: { 7: -4, 8: -2, 9: -1, 10: 0, 11: 1, 12: 2, 13: 3, 14: 5, 15: 7, 16: 10, 17: 13, 18: 17 },
  },
] as const;
