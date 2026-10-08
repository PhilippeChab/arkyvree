import { formatSpellLevel } from "@/shared/dnd3.5/spells.ts";

export function bySpellLevel(a: string, b: string) {
  return Number(a) - Number(b);
}

/** A spell level column's label, its key read as the level: "Cantrips", "Level 1"… */
export function spellLevelLabel(key: string) {
  return formatSpellLevel(Number(key));
}
