import type { ExtensionPackage } from "@/content/dnd3.5/builders/rulesets/types.ts";
import { DEITYS_WEAPON_FEATS } from "@/content/dnd3.5/data/feats/deitysWeapon.ts";
import { BOOK } from "@/content/dnd3.5/generated/complete-divine/index.ts";
import { DND35_COMPLETE_DIVINE_NAME } from "@/content/dnd3.5/rulesetNames.ts";

/** Complete Divine's package: its book, joined to its hand-written Deity's Weapon feats, in the extension it creates. */
export const DND35_COMPLETE_DIVINE_PACKAGE: ExtensionPackage = {
  name: "dnd35-complete-divine",
  type: "extension",
  seedsVersion: 20,
  ruleset: {
    name: DND35_COMPLETE_DIVINE_NAME,
    description: "Complete Divine — divine feats, domains, spells, and classes for D&D 3.5.",
  },
  content: { ...BOOK, standaloneFeats: [...BOOK.standaloneFeats, ...DEITYS_WEAPON_FEATS] },
};
