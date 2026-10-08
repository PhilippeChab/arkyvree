import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { createListboxScrollHandler } from "@/client/src/lib/listboxScroll.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import { type RulesetListItem, rulesetPickerQuery } from "@/client/src/lib/queries.ts";

/** A ruleset a create dialog's picker offers, under the heading it's listed under. */
export type RulesetOption = RulesetListItem & { group: "Campaign" | "My Drafts" | "Published" };

/** What a create dialog's `RulesetPicker` lists, and how it searches and pages: `useRulesetPickerOptions`'. */
export type RulesetPickerOptions = ReturnType<typeof useRulesetPickerOptions>;

/**
 * A create dialog's ruleset options, searched on the server, each listed once: the rulesets the user can build on, the
 * drafts they own or edit first ("My Drafts"), then the published ones ("Published"), and for a new character the
 * rulesets of the campaigns its player plays in too ("Campaign"). They load while `enabled`, the dialog open.
 */
export function useRulesetPickerOptions(creating: "campaign" | "character", enabled: boolean) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const buildable = useInfiniteQuery({ ...rulesetPickerQuery("published", debouncedSearch), enabled });
  const campaigns = useInfiniteQuery({
    ...rulesetPickerQuery("campaignAccessible", debouncedSearch),
    enabled: enabled && creating === "character",
  });

  const buildableRulesets = pageItems(buildable.data);
  const listedIds = new Set(buildableRulesets.map((ruleset) => ruleset.id));
  const rulesets: RulesetOption[] = [
    ...buildableRulesets
      .map((ruleset) => ({
        ...ruleset,
        group: ruleset.status === "Draft" ? ("My Drafts" as const) : ("Published" as const),
      }))
      .sort((a, b) => (a.group === b.group ? 0 : a.group === "My Drafts" ? -1 : 1)),
    ...pageItems(campaigns.data)
      .filter((ruleset) => !listedIds.has(ruleset.id))
      .map((ruleset) => ({ ...ruleset, group: "Campaign" as const })),
  ];

  return {
    loadError: buildable.error ?? campaigns.error,
    loading: buildable.isLoading || campaigns.isLoading,
    onScroll: createListboxScrollHandler([buildable, campaigns]),
    onSearch: setSearch,
    rulesets,
  };
}
