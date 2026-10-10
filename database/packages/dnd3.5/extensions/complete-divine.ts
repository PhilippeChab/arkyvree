import { CORE } from "@/content/dnd3.5/data/core.ts";
import { DEITYS_WEAPON_FEATS } from "@/content/dnd3.5/data/feats/deitysWeapon.ts";
import { BOOK } from "@/content/dnd3.5/generated/complete-divine/index.ts";
import { DND35_COMPLETE_DIVINE_NAME } from "@/content/dnd3.5/names.ts";
import { RulesetSeeder } from "@/database/packages/dnd3.5/seed/RulesetSeeder.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35CompleteDivine: ContentPackage = {
  name: "dnd35-complete-divine",
  type: "extension",
  seedsVersion: 20,
  seeds: [
    async (db) => {
      const seeder = await RulesetSeeder.createExtension(db, {
        name: DND35_COMPLETE_DIVINE_NAME,
        description: "Complete Divine — divine feats, domains, spells, and classes for D&D 3.5.",
      });
      await seeder.seedBook(
        {
          ...BOOK,
          standaloneFeats: [...BOOK.standaloneFeats, ...DEITYS_WEAPON_FEATS],
        },
        CORE.classes,
      );
    },
  ],
};

export default dnd35CompleteDivine;
