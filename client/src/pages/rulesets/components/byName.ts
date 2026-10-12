/** Orders records by name (a form's aptitudes, a cell's chips), so a list never depends on the order they came in. */
export function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name);
}
