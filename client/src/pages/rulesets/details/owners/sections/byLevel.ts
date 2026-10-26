/** Orders an owner's levels by their number (`position`), as its tabs list them. */
export function byLevel(a: { position: number }, b: { position: number }) {
  return a.position - b.position;
}
