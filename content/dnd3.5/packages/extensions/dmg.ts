import type { ExtensionPackage } from "@/content/dnd3.5/builders/rulesets/types.ts";
import { BOOK } from "@/content/dnd3.5/generated/dmg/index.ts";
import { DND35_DMG_NAME } from "@/content/dnd3.5/rulesetNames.ts";

export const DND35_DMG_PACKAGE: ExtensionPackage = {
  name: "dnd35-dmg",
  type: "extension",
  seedsVersion: 16,
  ruleset: { name: DND35_DMG_NAME, description: "Dungeon Master's Guide — prestige classes for D&D 3.5." },
  content: BOOK,
};
