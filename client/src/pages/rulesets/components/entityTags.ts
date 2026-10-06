import type { Tag } from "@/client/src/components/common/index.ts";

/** A skill that can't be used untrained */
export const TRAINED_ONLY: Tag = { label: "Trained Only", color: "warning" };

/** An ability an entity rests on: a skill's key ability, a save's */
export function abilityTag(name: string): Tag {
  return { label: name, color: "primary", tooltip: "Ability" };
}

/** An aptitude an entity is listed under */
export function aptitudeTag(name: string): Tag {
  return { label: name, color: "primary" };
}

/** A class's hit die */
export function hitDieTag(hd: number): Tag {
  return { label: `d${hd}`, color: "secondary", tooltip: "Hit die" };
}

/** A level's number, in a class's levels table */
export function levelTag(level: number): Tag {
  return { label: String(level), color: "primary" };
}

/** A race's size */
export function raceSizeTag(size: string): Tag {
  return { label: size, color: "secondary", tooltip: "Size" };
}
