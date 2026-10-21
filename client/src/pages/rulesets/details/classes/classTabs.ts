import type { RulesDescription } from "@/client/src/lib/queries.ts";

import type { ClassTab } from "./classTab.ts";
import { CLASS_CUSTOMIZATION_TABS, CLASS_TABS, describeSpellTabs } from "./sections/index.ts";

/**
 * The tabs a class page had before, by the address each one now opens: its Levels and Feat Pools tabs', Progression;
 * Spells Known's, the Spells tab on its table.
 */
const CLASS_TAB_ALIASES: Record<string, string> = {
  "feat-pools": "progression",
  levels: "progression",
  "spells-known": "spells?table=known",
  "spells-per-day": "spells",
};

/** The tab an address of a tab a class page had before opens (`section`); none for another. */
export function getClassTabAlias(section: string | undefined): string | undefined {
  if (section === undefined) return undefined;
  return Object.hasOwn(CLASS_TAB_ALIASES, section) ? CLASS_TAB_ALIASES[section] : undefined;
}

/**
 * A class page's tabs, by its ruleset's rules (`rules`): every class's (`CLASS_TABS`), then its spells' where its
 * rules have spell tables, then those that customize it. The first is the one it opens on.
 */
export function getClassTabs(rules: RulesDescription | undefined): ClassTab[] {
  const spellTabs = rules && rules.progression.tables.length > 0 ? describeSpellTabs(rules.words) : [];
  return [...CLASS_TABS, ...spellTabs, ...CLASS_CUSTOMIZATION_TABS];
}
