/** Orders a class's levels by their number, as its tabs list them. */
export function byLevel(a: { level: number }, b: { level: number }) {
  return a.level - b.level;
}
