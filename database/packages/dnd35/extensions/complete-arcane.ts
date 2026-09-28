import { DND35_COMPLETE_ARCANE_NAME } from "@/database/packages/dnd35/names.ts";
import { seedExtension } from "@/database/packages/dnd35/seed/extension.ts";
import type { ContentPackage } from "@/database/packages/types.ts";
import { BOOK } from "@/database/packages/dnd35-from-parser/generated/complete-arcane/index.ts";

const dnd35CompleteArcane: ContentPackage = {
  name: "dnd35-complete-arcane",
  type: "extension",
  seedsVersion: 1,
  seeds: [(db) => seedExtension(db, { name: DND35_COMPLETE_ARCANE_NAME, description: "Arcane spellcasting options, prestige classes, and feats for D&D 3.5." }, BOOK)],
};

export default dnd35CompleteArcane;
