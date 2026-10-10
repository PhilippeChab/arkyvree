import { DND35_CORE_PACKAGE } from "@/content/dnd3.5/packages/core.ts";
import { DND35_COMPLETE_ADVENTURER_PACKAGE } from "@/content/dnd3.5/packages/extensions/complete-adventurer.ts";
import { DND35_COMPLETE_ARCANE_PACKAGE } from "@/content/dnd3.5/packages/extensions/complete-arcane.ts";
import { DND35_COMPLETE_DIVINE_PACKAGE } from "@/content/dnd3.5/packages/extensions/complete-divine.ts";
import { DND35_COMPLETE_SCOUNDREL_PACKAGE } from "@/content/dnd3.5/packages/extensions/complete-scoundrel.ts";
import { DND35_COMPLETE_WARRIOR_PACKAGE } from "@/content/dnd3.5/packages/extensions/complete-warrior.ts";
import { DND35_DMG_PACKAGE } from "@/content/dnd3.5/packages/extensions/dmg.ts";
import { CHARACTERS } from "@/content/dnd3.5/testData/characters.ts";
import { RulesetSeeder } from "@/database/seeders/dnd3.5/RulesetSeeder.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { listContentPackages } from "./contentPackages.ts";
import type { RulesetContent } from "./types.ts";

/**
 * Each base rules' content, the one way the runner and the dev and test seeds reach a ruleset's packages, seeder and
 * test characters: one the database's enum gains has to be written here, or the database's code doesn't compile, and
 * its seeder is checked against the contract (`ContentSeeder`'s abstract members). A package's updates, which write,
 * are given here too (`updates`, by package name).
 */
export const RULESET_CONTENT = {
  "Dungeons & Dragons: 3.5": {
    core: DND35_CORE_PACKAGE,
    extensions: [
      DND35_COMPLETE_WARRIOR_PACKAGE,
      DND35_DMG_PACKAGE,
      DND35_COMPLETE_DIVINE_PACKAGE,
      DND35_COMPLETE_SCOUNDREL_PACKAGE,
      DND35_COMPLETE_ADVENTURER_PACKAGE,
      DND35_COMPLETE_ARCANE_PACKAGE,
    ],
    seeder: RulesetSeeder,
    testCharacters: CHARACTERS,
  },
} satisfies Record<BaseRules, RulesetContent>;

/** The packages, in the order the runner applies them: each base rules' core rules first, then its extensions. */
export const CONTENT_PACKAGES = listContentPackages(RULESET_CONTENT);
