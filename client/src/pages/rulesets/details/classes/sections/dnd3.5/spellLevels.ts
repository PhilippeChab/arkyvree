import { SPELL_LEVEL_LABELS } from "@/vocabulary/dnd3.5/spells.ts";

/** A spell level column's label, its key read as the level: "Cantrips", "Level 1"… */
export function spellLevelLabel(key: string) {
  return SPELL_LEVEL_LABELS[Number(key)];
}
