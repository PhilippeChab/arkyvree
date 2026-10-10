import type { ExtensionPackage } from "@/content/dnd3.5/builders/rulesets/types.ts";
import { BOOK } from "@/content/dnd3.5/generated/complete-arcane/index.ts";
import { DND35_COMPLETE_ARCANE_NAME } from "@/content/dnd3.5/rulesetNames.ts";

export const DND35_COMPLETE_ARCANE_PACKAGE: ExtensionPackage = {
  name: "dnd35-complete-arcane",
  type: "extension",
  seedsVersion: 1,
  ruleset: {
    name: DND35_COMPLETE_ARCANE_NAME,
    description: "Arcane spellcasting options, prestige classes, and feats for D&D 3.5.",
  },
  content: BOOK,
};
