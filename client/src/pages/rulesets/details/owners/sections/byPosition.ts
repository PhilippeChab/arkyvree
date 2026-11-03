/** Orders an owner's owned entities by their number (`position`), as its tabs list them. */
export function byPosition(a: { position: number }, b: { position: number }) {
  return a.position - b.position;
}
