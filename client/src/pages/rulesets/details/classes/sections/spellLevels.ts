const ORDINALS: Record<string, string> = { 0: "0th", 1: "1st", 2: "2nd", 3: "3rd" };

/** A spell level column's label: "1st", "2nd"… */
export function spellLevelLabel(key: string) {
  return ORDINALS[key] ?? `${key}th`;
}

export function bySpellLevel(a: string, b: string) {
  return Number(a) - Number(b);
}
