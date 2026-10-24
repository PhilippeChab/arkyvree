import type { RulesDescription } from "@/client/src/lib/queries.ts";

import { classKindOf } from "./classKind.ts";
import type { ClassTab } from "./classTab.ts";
import {
  CLASS_CUSTOMIZATION_TABS,
  describeCountsTabs,
  describeLinksTab,
  describeProgressionTab,
} from "./sections/index.ts";

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
 * A class page's tabs, by its ruleset's rules (`rules`): every class's progression (`describeProgressionTab`), the one it
 * opens on, then the entities its kind links it to where it links to any (`links`: 3.5's skills), its tables' and its
 * list's where its levels count entities on tables (`counts`: 3.5's spells), then those that customize it.
 */
export function getClassTabs(rules: RulesDescription | undefined): ClassTab[] {
  const links = classKindOf(rules)?.links;
  const linksTabs = rules && links ? [describeLinksTab(links, rules)] : [];
  const counts = rules?.progression.counts;
  const countsTabs = rules && counts && rules.progression.tables.length > 0 ? describeCountsTabs(counts, rules) : [];
  return [describeProgressionTab(rules), ...linksTabs, ...countsTabs, ...CLASS_CUSTOMIZATION_TABS];
}
