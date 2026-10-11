/** Points spent out of a total, a new character's point-buy's or a level's skill points: one sum and one wording. */

/** What's spent of the total, wherever points are spent: "Points Spent: 12 / 25". */
export function formatPointsSpent(spent: number, total: number) {
  return `Points Spent: ${spent} / ${total}`;
}

/** The points spent: each pick's (a score's cost, a skill's points), summed. */
export function pointsSpent(points: Record<string, number> | number[]) {
  return Object.values(points).reduce((sum, value) => sum + value, 0);
}
