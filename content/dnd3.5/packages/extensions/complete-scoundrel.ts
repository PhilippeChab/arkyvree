import type { ExtensionPackage } from "@/content/dnd3.5/builders/rulesets/types.ts";
import { BOOK } from "@/content/dnd3.5/generated/complete-scoundrel/index.ts";
import { DND35_COMPLETE_SCOUNDREL_NAME } from "@/content/dnd3.5/rulesetNames.ts";

export const DND35_COMPLETE_SCOUNDREL_PACKAGE: ExtensionPackage = {
  name: "dnd35-complete-scoundrel",
  type: "extension",
  seedsVersion: 4,
  ruleset: {
    name: DND35_COMPLETE_SCOUNDREL_NAME,
    description: "Feats, prestige classes, and tricks for scoundrels in D&D 3.5.",
  },
  content: BOOK,
};
