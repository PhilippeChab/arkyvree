import type { BaseRules } from "@/shared/enums.ts";

import { type ClassTab, getClassSections } from "./classSectionFactory.ts";
import { CLASS_CUSTOMIZATION_TABS, CLASS_TABS } from "./sections/index.ts";

/**
 * The tab an address of a tab a class page had before opens (`section`): the one its base rules' tab replaced, or one
 * they renamed (`tabAliases`); none for another.
 */
export function getClassTabAlias(baseRules: BaseRules, section: string | undefined): string | undefined {
  if (section === undefined) return undefined;
  const { tabAliases, tabs } = getClassSections(baseRules);
  const replacing = tabs.find((tab) => tab.replaces === section);
  if (replacing) return replacing.key;
  return Object.hasOwn(tabAliases, section) ? tabAliases[section] : undefined;
}

/**
 * A class page's tabs, by its ruleset's base rules: every class's (`CLASS_TABS`), each in the place of its base rules'
 * tab that replaces it, then its base rules' others, then those that customize it. The first is the one it opens on.
 */
export function getClassTabs(baseRules: BaseRules): ClassTab[] {
  const { tabs } = getClassSections(baseRules);
  return [
    ...CLASS_TABS.map((tab) => tabs.find((own) => own.replaces === tab.key) ?? tab),
    ...tabs.filter((tab) => !tab.replaces),
    ...CLASS_CUSTOMIZATION_TABS,
  ];
}
