import { DND35_CORE_PACKAGE } from "@/content/dnd3.5/packages/core.ts";
import { DND35_COMPLETE_ADVENTURER_PACKAGE } from "@/content/dnd3.5/packages/extensions/complete-adventurer.ts";
import { DND35_COMPLETE_ARCANE_PACKAGE } from "@/content/dnd3.5/packages/extensions/complete-arcane.ts";
import { DND35_COMPLETE_DIVINE_PACKAGE } from "@/content/dnd3.5/packages/extensions/complete-divine.ts";
import { DND35_COMPLETE_SCOUNDREL_PACKAGE } from "@/content/dnd3.5/packages/extensions/complete-scoundrel.ts";
import { DND35_COMPLETE_WARRIOR_PACKAGE } from "@/content/dnd3.5/packages/extensions/complete-warrior.ts";
import { DND35_DMG_PACKAGE } from "@/content/dnd3.5/packages/extensions/dmg.ts";
import { seedDnd35Package } from "@/database/seeders/dnd3.5/packages.ts";

import { toContentPackage } from "./contentPackages.ts";
import type { ContentPackage } from "./types.ts";

/**
 * The packages, in the order the runner applies them, the core rules first: each its definition (`content/`), seeded by
 * its ruleset's seeder. A package's updates, which write, are given here (`{ ...toContentPackage(…), updates }`).
 */
export const registry: ContentPackage[] = [
  toContentPackage(DND35_CORE_PACKAGE, seedDnd35Package),
  toContentPackage(DND35_COMPLETE_WARRIOR_PACKAGE, seedDnd35Package),
  toContentPackage(DND35_DMG_PACKAGE, seedDnd35Package),
  toContentPackage(DND35_COMPLETE_DIVINE_PACKAGE, seedDnd35Package),
  toContentPackage(DND35_COMPLETE_SCOUNDREL_PACKAGE, seedDnd35Package),
  toContentPackage(DND35_COMPLETE_ADVENTURER_PACKAGE, seedDnd35Package),
  toContentPackage(DND35_COMPLETE_ARCANE_PACKAGE, seedDnd35Package),
];
