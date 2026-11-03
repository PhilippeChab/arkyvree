import { useMemo } from "react";

import type { RulesDescription } from "@/client/src/lib/queries.ts";

import { useRules } from "./useRules.ts";

/** A kind whose customizations have a page of their own, as its rules describe it: an owned kind's with its owner. */
export type CustomizationPage = RulesDescription["customizationPages"][number];

/**
 * The kinds whose customizations have a page of their own, by type (3.5's feats, items, spells, races and class levels),
 * every base rules' alike, a kind being one module's: what a customization page's URL names, and what a link to an
 * entity opens. The app's pages wait for the rules, so they're in.
 */
export function useCustomizationPages(): ReadonlyMap<string, CustomizationPage> {
  const { all } = useRules();
  return useMemo(
    () =>
      new Map(Object.values(all ?? {}).flatMap((rules) => rules.customizationPages.map((page) => [page.type, page]))),
    [all],
  );
}
