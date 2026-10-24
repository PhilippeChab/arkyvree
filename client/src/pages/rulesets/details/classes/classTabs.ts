import type { RulesDescription } from "@/client/src/lib/queries.ts";

import { classKindOf } from "./classKind.ts";
import type { ClassTab } from "./classTab.ts";
import {
  describeClassCustomizationTabs,
  describeCountsTabs,
  describeLinksTab,
  describeProgressionTab,
} from "./sections/index.ts";

/**
 * The tab an address of a tab a class page had before opens (`section`), as its rules' progression says
 * (`tabAliases`); none for another.
 */
export function getClassTabAlias(rules: RulesDescription | undefined, section: string | undefined): string | undefined {
  const aliases = rules?.progression.tabAliases;
  if (section === undefined || !aliases) return undefined;
  return Object.hasOwn(aliases, section) ? aliases[section] : undefined;
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
  return [describeProgressionTab(rules), ...linksTabs, ...countsTabs, ...describeClassCustomizationTabs(rules)];
}
