/** The labels a class's progression reads its values, its presets and its spell levels by. */
export default class ProgressionLabels {
  /** An ordinal's suffix, as a book's table writes its spell levels: "1st", "2nd", "3rd", "4th". */
  private static formatOrdinal(level: number) {
    const suffix = level === 1 ? "st" : level === 2 ? "nd" : level === 3 ? "rd" : "th";
    return `${level}${suffix}`;
  }

  /** Values from 0 to `max`, each read by `read`: a track's labels. */
  static listLabels(max: number, read: (value: number) => string) {
    return Array.from({ length: max + 1 }, (_, value) => read(value));
  }

  /**
   * A track's presets, a progression each: its label (`labels`) and its values by class level (`values`), in the order
   * `values` gives them (the vocabulary's).
   */
  static listPresets<K extends string>(labels: Record<K, string>, values: Record<K, number[]>) {
    return (Object.keys(values) as K[]).map((key) => ({ key, label: labels[key], values: values[key] }));
  }

  /** A spell level as a pasted table's header may name it: its number, its ordinal, and a 0's cantrips and orisons. */
  static listSpellLevelAliases(level: number) {
    return level === 0
      ? ["0", "0th", "cantrip", "cantrips", "orison", "orisons"]
      : [String(level), ProgressionLabels.formatOrdinal(level)];
  }
}
