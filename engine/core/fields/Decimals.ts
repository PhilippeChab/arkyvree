/** A decimal's value as a field keeps it. */
export default class Decimals {
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
