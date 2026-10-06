import { CORE, CORE_RULESET } from "@/database/packages/dnd35/data/core.ts";
import { RulesetSeeder } from "@/database/packages/dnd35/seed/RulesetSeeder.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35: ContentPackage = {
  name: "dnd35",
  type: "base_ruleset",
  seedsVersion: 49,
  seeds: [
    async (db) => {
      const seeder = await RulesetSeeder.createCore(db, CORE_RULESET);
      await seeder.seedCore(CORE);
    },
  ],
};

export default dnd35;
