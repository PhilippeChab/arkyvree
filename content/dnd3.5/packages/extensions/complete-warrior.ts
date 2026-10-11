import type { ExtensionPackage } from "@/content/dnd3.5/builders/rulesets/types.ts";
import { BOOK } from "@/content/dnd3.5/generated/complete-warrior/index.ts";
import { DND35_COMPLETE_WARRIOR_NAME } from "@/content/dnd3.5/rulesetNames.ts";

export const DND35_COMPLETE_WARRIOR_PACKAGE: ExtensionPackage = {
  name: "dnd35-complete-warrior",
  type: "extension",
  seedsVersion: 22,
  ruleset: { name: DND35_COMPLETE_WARRIOR_NAME, description: "Martial feats and combat options for D&D 3.5." },
  content: BOOK,
};
