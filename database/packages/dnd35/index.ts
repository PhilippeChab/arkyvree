import { seedCore } from "@/database/packages/dnd35/seed/core.ts";
import type { ContentPackage } from "@/database/packages/types.ts";

const dnd35: ContentPackage = {
  name: "dnd35",
  type: "base_ruleset",
  seedsVersion: 49,
  seeds: [seedCore],
};

export default dnd35;
