import { useOpenEntity } from "@/client/src/pages/rulesets/hooks/index.ts";
import { SectionContent } from "@/client/src/components/common/index.ts";
import type { RulesetAbility } from "@/client/src/hooks/index.ts";
import { DescriptionCell, RulesetSectionTable, SectionActions } from "@/client/src/pages/rulesets/components/index.ts";
import { abilityQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import { FitnessCenter as AbilitiesIcon } from "@mui/icons-material";
import { Box } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { abilitiesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";

const ABILITIES_COLUMNS = [
  { key: "name", label: "Name", width: "30%" },
  { key: "description", label: "Description", width: "70%" },
];

type Ability = RulesetAbility;

export function AbilitiesSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(abilitiesQuery(ruleset.id, childOnly));

  const abilities = data?.items ?? [];

  const renderCell = (ability: Ability, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return ability.name;
      case "description":
        return (
          <DescriptionCell text={ability.description} />
        );
      default:
        return null;
    }
  };

  const handleRowClick = (ability: Ability) => {
    openEntity(`abilities/${ability.id}`);
  };

  const handleRowMouseEnter = useCallback((ability: Ability) => {
    void queryClient.prefetchQuery(abilityQuery(ruleset.id, ability.id));
  }, [queryClient, ruleset.id]);

  return (
    <SectionContent>
      {/* No search bar here: the actions sit alone, and take no space when there are none. */}
      <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1, "&:empty": { display: "none" } }}>
        <SectionActions ruleset={ruleset} childOnly={childOnly} onChildOnlyChange={onChildOnlyChange} />
      </Box>
      <RulesetSectionTable
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
    </SectionContent>
  );
}
