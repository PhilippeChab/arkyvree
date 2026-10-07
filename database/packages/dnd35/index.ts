import type { ContentPackage } from "@/database/packages/types.ts";

import { CORE, CORE_RULESET } from "./data/core.ts";
import { RulesetSeeder } from "./seed/RulesetSeeder.ts";

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
