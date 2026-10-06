import { RulesetSeeder } from "@/database/packages/dnd35/seed/RulesetSeeder.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35: ContentPackage = {
  name: "dnd35",
  type: "base_ruleset",
  seedsVersion: 49,
  seeds: [(db) => RulesetSeeder.seedCore(db)],
};

export default dnd35;
