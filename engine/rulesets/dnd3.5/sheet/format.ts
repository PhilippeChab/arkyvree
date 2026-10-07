/** A modifier as the sheet prints it: signed, +0 when missing. */
export function formatModifier(value?: number): string {
  if (value === undefined) return "+0";
  return value >= 0 ? `+${value}` : value.toString();
}
