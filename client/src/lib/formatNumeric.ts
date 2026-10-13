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

/** A die as dice notation writes it ("d8"): a class's hit die. */
export function formatDie(sides: number): string {
  return `d${sides}`;
}

/** A number without the zeros its decimals end with ("2" for "2.00", "1.5" for "1.50"), or null when it has none. */
export function formatTrimmed(value: string | number | null | undefined): string | null {
  const formatted = formatDecimal(value);
  return formatted === null ? null : String(Number(formatted));
}

/** An item's weight ("5.00 lbs"), or null when it has none. */
export function formatWeight(weight: string | number | null | undefined): string | null {
  const formatted = formatDecimal(weight);
  return formatted === null ? null : `${formatted} lbs`;
}

/** The unit after a weight as `formatTrimmed` writes it: "lb" after a single pound ("1"), "lbs" after any other. */
export function poundsUnit(pounds: string | null): string {
  return pounds === "1" ? "lb" : "lbs";
}
