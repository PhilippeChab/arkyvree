/** An item's cost ("15.00 gp"), or null when it has none. */
export function formatCost(costGp: string | number | null | undefined): string | null {
  const formatted = formatDecimal(costGp);
  return formatted === null ? null : `${formatted} gp`;
}

/** A count with its noun ("1 player", "3 players"). */
export function formatCount(count: number, noun: string): string {
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

export function formatDecimal(value: string | number | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(n)) return null;
  return n.toFixed(2);
}

/** A bonus with its sign ("+2", "-1"); a missing one reads "+0". */
export function formatSigned(value: number | null | undefined): string {
  const n = value ?? 0;
  return n >= 0 ? `+${n}` : `${n}`;
}

/** An item's weight ("5.00 lbs"), or null when it has none. */
export function formatWeight(weight: string | number | null | undefined): string | null {
  const formatted = formatDecimal(weight);
  return formatted === null ? null : `${formatted} lbs`;
}
