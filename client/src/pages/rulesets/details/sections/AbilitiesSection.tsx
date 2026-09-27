import { RulesetSectionTable, SectionActions } from "@/client/src/pages/rulesets/components/index.ts";
import { abilityQuery } from "@/client/src/pages/rulesets/details/entities/entityDetailQueries.ts";
import type { RulesetSectionProps } from "@/client/src/pages/rulesets/details/sectionFactory.ts";
import type { rpc } from "@/client/src/services/rpc.ts";
import { FitnessCenter as AbilitiesIcon } from "@mui/icons-material";
import { Box, Typography } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { abilitiesQuery } from "@/client/src/pages/rulesets/details/sectionQueries.ts";

const ABILITIES_COLUMNS = [
  { key: "name", label: "Name", width: "30%" },
  { key: "description", label: "Description", width: "70%" },
];

type AbilitiesPaginated = InferResponseType<(typeof rpc.api.rulesets)[":id"]["abilities"]["$get"], 200>;
type Ability = AbilitiesPaginated["items"][number];

export function AbilitiesSection({ ruleset, childOnly, onChildOnlyChange }: RulesetSectionProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery(abilitiesQuery(ruleset.id, childOnly));

  const abilities = data?.items ?? [];

  const renderCell = (ability: Ability, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return ability.name;
      case "description":
        return (
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {ability.description || "-"}
          </Typography>
        );
      default:
        return null;
    }
  };

  const handleRowClick = (ability: Ability) => {
    navigate(`/rulesets/${ruleset.id}/abilities/${ability.id}`);
  };

  const handleRowMouseEnter = useCallback((ability: Ability) => {
    void queryClient.prefetchQuery(abilityQuery(ruleset.id, ability.id));
  }, [queryClient, ruleset.id]);

  return (
    <Box sx={{ width: "100%", maxWidth: 1200, margin: "0 auto" }}>
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
    </Box>
  );
}
