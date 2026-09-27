const ORDINALS: Record<string, string> = { 0: "0th", 1: "1st", 2: "2nd", 3: "3rd" };

/** A spell level column's label: "1st", "2nd"… */
export const spellLevelLabel = (key: string) => ORDINALS[key] ?? `${key}th`;

export const bySpellLevel = (a: string, b: string) => Number(a) - Number(b);
