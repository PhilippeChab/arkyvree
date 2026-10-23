/** A unit an amount reads in, as the engine describes it: its word after one ("lb"), and after any other ("lbs"). */
export interface AmountUnit {
  many: string;
  one: string;
}

/**
 * An amount in its unit, its two decimals kept ("5.00 lbs", "15.00 gp": its unit's word after any amount, `many`), or
 * null when it has none.
 */
export function formatAmount(value: string | number | null | undefined, unit: AmountUnit): string | null {
  const formatted = formatDecimal(value);
  return formatted === null ? null : `${formatted} ${unit.many}`;
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

/**
 * An amount in its unit as a phone or a box shows it, without the zeros its decimals end with, its unit's word after one
 * (`one`: "1 lb") or any other amount (`many`: "2 lbs", "0.5 lbs"), or null when it has none.
 */
export function formatTrimmedAmount(value: string | number | null | undefined, unit: AmountUnit): string | null {
  const trimmed = formatTrimmed(value);
  return trimmed === null ? null : `${trimmed} ${unitAfter(trimmed, unit)}`;
}

/** An amount's unit's word after it as `formatTrimmed` writes it: `one` after "1", `many` after any other. */
export function unitAfter(trimmed: string | null, unit: AmountUnit): string {
  return trimmed === "1" ? unit.one : unit.many;
}
