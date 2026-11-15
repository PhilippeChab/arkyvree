import type { ExtensionPackage } from "@/content/dnd3.5/builders/rulesets/types.ts";
import { BOOK } from "@/content/dnd3.5/generated/epic/index.ts";
import { DND35_EPIC_NAME } from "@/content/dnd3.5/rulesetNames.ts";

export const DND35_EPIC_PACKAGE: ExtensionPackage = {
  name: "dnd35-epic",
  type: "extension",
  seedsVersion: 1,
  ruleset: {
    name: DND35_EPIC_NAME,
    description:
      "The SRD's epic levels for D&D 3.5: the core classes' levels 21 to 40, their epic bonus feats, and the epic feats. A ruleset that subscribes raises its Last Level past 20.",
  },
  content: BOOK,
};
