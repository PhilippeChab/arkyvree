import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { FitnessCenter as AbilitiesIcon } from "@mui/icons-material";
import { Box, ToggleButton, Typography } from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { abilitiesQuery } from "../sectionQueries.ts";

const ABILITIES_COLUMNS = [
  { key: "name", label: "Name", width: "30%" },
  { key: "description", label: "Description", width: "70%" },
];

type AbilitiesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["abilities"]["$get"]>;
type AbilitiesPaginated = Exclude<AbilitiesResponse, { error: string }>;
type Ability = AbilitiesPaginated["items"][number];

interface AbilitiesSectionProps {
  ruleset: {
    id: string;
    name: string;
    rulesetId?: string | null;
    userId?: string | null;
    status?: string;
  };
  childOnly: boolean;
  onChildOnlyChange: (childOnly: boolean) => void;
}

export function AbilitiesSection({ ruleset, childOnly, onChildOnlyChange }: AbilitiesSectionProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const isFork = !!ruleset.rulesetId;

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
    queryClient.prefetchQuery({
      queryKey: queryKeys.rulesets.entity(ruleset.id, "abilities", ability.id),
      queryFn: async () => {
        return parseResponse(rpc.api.rulesets[":id"].abilities[":abilityId"].$get({
          param: { id: ruleset.id, abilityId: ability.id },
        }));
      },
    });
  }, [queryClient, ruleset.id]);

  return (
    <Box sx={{ width: "100%", maxWidth: 1200, margin: "0 auto" }}>
      {isFork && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 1 }}>
          <ToggleButton
            value="childOnly"
            selected={childOnly}
            onChange={() => onChildOnlyChange(!childOnly)}
            sx={{ textTransform: "none" }}
          >
            Local changes
          </ToggleButton>
        </Box>
      )}
      <RulesetSectionTable
        data={abilities}
        isLoading={isLoading}
        columns={ABILITIES_COLUMNS}
        onRowClick={handleRowClick}
        onRowMouseEnter={handleRowMouseEnter}
        renderCell={renderCell}
        emptyIcon={<AbilitiesIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
        emptyTitle="No abilities"
        emptyDescription="No abilities available for this ruleset."
      />
    </Box>
  );
}
