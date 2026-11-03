import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useDebouncedValue } from "@/client/src/hooks/index.ts";
import { createListboxScrollHandler } from "@/client/src/lib/listboxScroll.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import { type RulesetListItem, rulesetPickerQuery } from "@/client/src/lib/queries.ts";

import { findOwnRuleset } from "./ownRuleset.ts";
import { ownRulesetsQuery } from "./ownRulesetQueries.ts";

/** A ruleset a create dialog's picker offers, under the heading it's listed under. */
export type RulesetOption = RulesetListItem & { group: "Campaign" | "My Drafts" | "Published" };

/** What a create dialog's `RulesetPicker` lists, and how it searches and pages: `useRulesetPickerOptions`'. */
export type RulesetPickerOptions = ReturnType<typeof useRulesetPickerOptions>;

/** A ruleset the user can build on, under its group: its owner's and its editors' drafts, or a published one. */
function toBuildableOption(ruleset: RulesetListItem): RulesetOption {
  return { ...ruleset, group: ruleset.status === "Draft" ? "My Drafts" : "Published" };
}

/**
 * A create dialog's ruleset options, searched on the server, each listed once: the rulesets the user can build on, the
 * drafts they own or edit first ("My Drafts"), then the published ones ("Published"), and for a new character the
 * rulesets of the campaigns its player plays in too ("Campaign"), and the one its dialog starts on (`preselected`): the
 * user's own when they own one to play (`findOwnRuleset`). They load while `enabled`, the dialog open.
 */
export function useRulesetPickerOptions(creating: "campaign" | "character", enabled: boolean) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const buildable = useInfiniteQuery({ ...rulesetPickerQuery("published", debouncedSearch), enabled });
  const forCharacter = enabled && creating === "character";
  const forks = useQuery({ ...ownRulesetsQuery(), enabled: forCharacter });
  const campaigns = useInfiniteQuery({
    ...rulesetPickerQuery("campaignAccessible", debouncedSearch),
    enabled: forCharacter,
  });

  const buildableRulesets = pageItems(buildable.data);
  const listedIds = new Set(buildableRulesets.map((ruleset) => ruleset.id));
  const rulesets: RulesetOption[] = [
    ...buildableRulesets
      .map((ruleset) => toBuildableOption(ruleset))
      .sort((a, b) => (a.group === b.group ? 0 : a.group === "My Drafts" ? -1 : 1)),
    ...pageItems(campaigns.data)
      .filter((ruleset) => !listedIds.has(ruleset.id))
      .map((ruleset) => ({ ...ruleset, group: "Campaign" as const })),
  ];

  const own = findOwnRuleset(forks.data ?? []);

  return {
    loadError: buildable.error ?? campaigns.error ?? forks.error,
    loading: buildable.isLoading || campaigns.isLoading,
    onScroll: createListboxScrollHandler([buildable, campaigns]),
    onSearch: setSearch,
    preselected: own ? toBuildableOption(own) : null,
    rulesets,
  };
}
