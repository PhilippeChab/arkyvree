import dnd35CompleteAdventurer from "./dnd35/extensions/complete-adventurer.ts";
import dnd35CompleteArcane from "./dnd35/extensions/complete-arcane.ts";
import dnd35CompleteDivine from "./dnd35/extensions/complete-divine.ts";
import dnd35CompleteScoundrel from "./dnd35/extensions/complete-scoundrel.ts";
import dnd35CompleteWarrior from "./dnd35/extensions/complete-warrior.ts";
import dnd35Dmg from "./dnd35/extensions/dmg.ts";
import dnd35 from "./dnd35/index.ts";
import type { ContentPackage } from "./types.ts";

export const registry: ContentPackage[] = [
  dnd35,
  dnd35CompleteWarrior,
  dnd35Dmg,
  dnd35CompleteDivine,
  dnd35CompleteScoundrel,
  dnd35CompleteAdventurer,
  dnd35CompleteArcane,
];
