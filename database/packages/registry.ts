import dnd35 from "@/database/packages/dnd35/index.ts";
import dnd35CompleteDivine from "@/database/packages/dnd35/extensions/complete-divine/index.ts";
import dnd35CompleteAdventurer from "@/database/packages/dnd35/extensions/complete-adventurer/index.ts";
import dnd35CompleteScoundrel from "@/database/packages/dnd35/extensions/complete-scoundrel/index.ts";
import dnd35CompleteWarrior from "@/database/packages/dnd35/extensions/complete-warrior/index.ts";
import dnd35CompleteArcane from "@/database/packages/dnd35/extensions/complete-arcane/index.ts";
import dnd35Dmg from "@/database/packages/dnd35/extensions/dmg/index.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

export const registry: ContentPackage[] = [dnd35, dnd35CompleteWarrior, dnd35Dmg, dnd35CompleteDivine, dnd35CompleteScoundrel, dnd35CompleteAdventurer, dnd35CompleteArcane];
