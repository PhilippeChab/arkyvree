import { useQueries } from "@tanstack/react-query";

import type { TableColumn } from "@/client/src/components/common/index.ts";
import { type RulesetOptions, rulesetOptionsQuery } from "@/client/src/lib/queries.ts";
import { isOneOf } from "@/shared/isOneOf.ts";

import { useRulesetRules } from "./useRulesetRules.ts";

/** The lists of a ruleset a list's reference column names an entity of, by its kind. */
const REFERENCE_LISTS = ["abilities", "saves"] as const satisfies readonly (keyof RulesetOptions)[];

/**
 * An entity type's list on its ruleset's page, as its rules describe it (`lists`): its table's columns (its name's,
 * its own values', its description's, which takes what's left), its description (`list`: how each value reads), the
 * names of the entities its reference columns name (`names`, by id), and why they didn't load (`error`). Before its
 * rules load, a name and a description.
 */
export function useEntityList(rulesetId: string, entityType: string) {
  const { rules } = useRulesetRules(rulesetId);
  const list = rules?.lists[entityType];
  const kinds = [
    ...new Set(
      (list?.columns ?? []).flatMap((column) =>
        column.reads === "reference" && isOneOf(column.references, REFERENCE_LISTS) ? [column.references] : [],
      ),
    ),
  ];
  const references = useQueries({ queries: kinds.map((kind) => rulesetOptionsQuery(kind, rulesetId)) });
  const names = new Map(references.flatMap(({ data }) => (data ?? []).map((entity) => [entity.id, entity.name])));
  const error = references.find((reference) => reference.error)?.error;
  const nameShare = list?.nameShare ?? 25;
  const own = list?.columns ?? [];
  const columns: TableColumn[] = [
    { key: "name", label: "Name", width: `${nameShare}%` },
    ...own.map(({ key, label, share, slot }) => ({ key, label, width: `${share}%`, slot })),
    {
      key: "description",
      label: "Description",
      width: `${100 - nameShare - own.reduce((total, column) => total + column.share, 0)}%`,
      slot: "block",
    },
  ];
  return { columns, error, list, names };
}
