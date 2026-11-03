/**
 * A number's value as a field keeps it: to its places, and within what it holds exactly, its value times ten to its
 * places a safe integer (`Number.MAX_SAFE_INTEGER`): past it, a number is stored rounded off unseen.
 */
export default class Decimals {
  /** Whether a number kept to `places` places (none: a whole number) holds exactly: within `largest`. */
  static holds(value: number, places = 0): boolean {
    return Math.abs(value) * 10 ** places <= Number.MAX_SAFE_INTEGER;
  }

  /** The largest number kept to `places` places (none: a whole number) holds exactly, its smallest the opposite. */
  static largest(places = 0): number {
    return Number.MAX_SAFE_INTEGER / 10 ** places;
  }

  /**
   * A decimal kept to `places` places, half away from zero, as its shortest text reads it (to two, `1.005` is `1.01`),
   * written out whatever its size (never in exponent form: `1e-7` is `0`).
   */
  static toPlaces(value: number, places: number): number {
    const text = Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 20, useGrouping: false });
    const [whole, fraction = ""] = text.split(".");
    const unit = 10n ** BigInt(places);
    let scaled = BigInt(whole + fraction.padEnd(places, "0").slice(0, places));
    if ((fraction[places] ?? "0") >= "5") scaled += 1n;
    const rounded = Number(
      places === 0 ? `${scaled}` : `${scaled / unit}.${String(scaled % unit).padStart(places, "0")}`,
    );
    return value < 0 && rounded !== 0 ? -rounded : rounded;
  }
}
