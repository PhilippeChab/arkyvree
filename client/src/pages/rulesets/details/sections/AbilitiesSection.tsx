import { Stack } from "@mui/material";
import { keepPreviousData, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { LoadMoreButton, SectionContent } from "@/client/src/components/common/index.ts";
import { AbilitiesIcon } from "@/client/src/components/icons/index.ts";
import type { RulesetAbility } from "@/client/src/hooks/index.ts";
import { pageItems } from "@/client/src/lib/pageItems.ts";
import { DescriptionCell, RulesetSectionTable, SectionActions } from "@/client/src/pages/rulesets/components/index.ts";
import { abilityQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { abilitiesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { useOpenEntity } from "@/client/src/pages/rulesets/hooks/index.ts";

type Ability = RulesetAbility;

const ABILITIES_COLUMNS = [
  { key: "name", label: "Name", width: "30%" },
  { key: "description", label: "Description", width: "70%" },
];

export function AbilitiesSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { data, isLoading, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    ...abilitiesQuery(ruleset.id, { search: "", childOnly }),
    placeholderData: keepPreviousData,
  });

  const abilities = pageItems(data);

  const renderCell = (ability: Ability, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return ability.name;
      case "description":
        return <DescriptionCell text={ability.description} />;
      default:
        return null;
    }
  };

  const handleRowClick = (ability: Ability) => {
    openEntity(`abilities/${ability.id}`);
  };

  const handleRowMouseEnter = useCallback(
    (ability: Ability) => {
      void queryClient.prefetchQuery(abilityQuery(ruleset.id, ability.id));
    },
    [queryClient, ruleset.id],
  );

  return (
    <SectionContent>
      <Stack spacing={1}>
        {/* No search bar here: the actions sit alone, and take no space when there are none. */}
        <Stack direction="row" sx={{ justifyContent: "flex-end", "&:empty": { display: "none" } }}>
          <SectionActions ruleset={ruleset} childOnly={childOnly} onChildOnlyChange={onChildOnlyChange} />
        </Stack>
        <RulesetSectionTable
          what="Abilities"
          error={error}
          data={abilities}
          isLoading={isLoading}
          columns={ABILITIES_COLUMNS}
          onRowClick={handleRowClick}
          onRowMouseEnter={handleRowMouseEnter}
          renderCell={renderCell}
          emptyIcon={AbilitiesIcon}
          emptyTitle="No abilities"
          emptyDescription="No abilities available for this ruleset."
        />
        <LoadMoreButton
          hasNextPage={hasNextPage}
          isFetchingNextPage={isFetchingNextPage}
          onClick={() => fetchNextPage()}
        />
      </Stack>
    </SectionContent>
  );
}
