import {
  ARMOR,
  EXOTIC_WEAPONS,
  MARTIAL_WEAPONS,
  SHIELDS,
  SIMPLE_WEAPONS,
} from "@/content/dnd3.5/generated/srd/items/index.ts";

/** The items others are made from: every weapon, armor and shield. A new ruleset starts with them. */
export const TEMPLATE_ITEMS = [...SIMPLE_WEAPONS, ...MARTIAL_WEAPONS, ...EXOTIC_WEAPONS, ...ARMOR, ...SHIELDS];
