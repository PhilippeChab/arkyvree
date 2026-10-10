import type { ExtensionPackage } from "@/content/dnd3.5/builders/rulesets/types.ts";
import { BOOK } from "@/content/dnd3.5/generated/complete-adventurer/index.ts";
import { DND35_COMPLETE_ADVENTURER_NAME } from "@/content/dnd3.5/rulesetNames.ts";

export const DND35_COMPLETE_ADVENTURER_PACKAGE: ExtensionPackage = {
  name: "dnd35-complete-adventurer",
  type: "extension",
  seedsVersion: 6,
  ruleset: {
    name: DND35_COMPLETE_ADVENTURER_NAME,
    description: "Rogue, scout, and skill-focused options for D&D 3.5.",
  },
  content: BOOK,
};
