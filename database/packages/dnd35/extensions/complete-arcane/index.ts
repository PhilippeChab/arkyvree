import extensionSeed from "@/database/packages/dnd35/extensions/complete-arcane/v1/seed.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35CompleteArcane: ContentPackage = {
  name: "dnd35-complete-arcane",
  type: "extension",
  baseRuleset: "dnd35",
  description: "Complete Arcane — arcane spellcasting options, prestige classes, and feats for D&D 3.5",
  version: 1,
  seeds: [extensionSeed],
  updates: {},
};

export default dnd35CompleteArcane;
