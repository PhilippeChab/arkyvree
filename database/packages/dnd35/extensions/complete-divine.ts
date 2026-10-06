import { BOOK } from "@/database/packages/dnd35-from-parser/generated/complete-divine/index.ts";
import { DEITYS_WEAPON_FEATS } from "@/database/packages/dnd35/data/feats/deitysWeapon.ts";
import { DND35_COMPLETE_DIVINE_NAME } from "@/database/packages/dnd35/names.ts";
import { seedExtension } from "@/database/packages/dnd35/seed/extension.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35CompleteDivine: ContentPackage = {
  name: "dnd35-complete-divine",
  type: "extension",
  seedsVersion: 20,
  seeds: [
    (db) =>
      seedExtension(
        db,
        {
          name: DND35_COMPLETE_DIVINE_NAME,
          description: "Complete Divine — divine feats, domains, spells, and classes for D&D 3.5.",
        },
        {
          ...BOOK,
          standaloneFeats: [...BOOK.standaloneFeats, ...DEITYS_WEAPON_FEATS],
        },
      ),
  ],
};

export default dnd35CompleteDivine;
