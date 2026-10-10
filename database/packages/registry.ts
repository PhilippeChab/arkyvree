import dnd35CompleteAdventurer from "./dnd3.5/extensions/complete-adventurer.ts";
import dnd35CompleteArcane from "./dnd3.5/extensions/complete-arcane.ts";
import dnd35CompleteDivine from "./dnd3.5/extensions/complete-divine.ts";
import dnd35CompleteScoundrel from "./dnd3.5/extensions/complete-scoundrel.ts";
import dnd35CompleteWarrior from "./dnd3.5/extensions/complete-warrior.ts";
import dnd35Dmg from "./dnd3.5/extensions/dmg.ts";
import dnd35 from "./dnd3.5/index.ts";
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
