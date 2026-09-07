import { EntityDetailLayout } from "@/client/src/pages/rulesets/components/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { Box, Card, CardContent, Typography } from "@mui/material";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router-dom";

export default function AbilityDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: rulesetId, abilityId } = useParams<{ id: string; abilityId: string }>();
  const backUrl = (location.state as { from?: string })?.from ?? `/rulesets/${rulesetId}/abilities`;

  const { data: ruleset, isLoading: isRulesetLoading } = useQuery({
    queryKey: queryKeys.rulesets.detail(rulesetId!),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].$get({ param: { id: rulesetId! } });
      if (!response.ok) throw new Error("Failed to fetch ruleset");
      return response.json();
    },
    enabled: !!rulesetId,
  });

  const { data: ability, isLoading: isEntityLoading } = useQuery({
    queryKey: queryKeys.rulesets.entity(rulesetId!, "abilities", abilityId!),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].abilities[":abilityId"].$get({
        param: { id: rulesetId!, abilityId: abilityId! },
      });
      if (!response.ok) throw new Error("Failed to fetch ability");
      return response.json();
    },
    enabled: !!rulesetId && !!abilityId,
  });

  usePageTitle(ability?.name);

  return (
    <EntityDetailLayout
      entityName={ability?.name}
      rulesetName={ruleset?.name}
      onBack={() => navigate(backUrl)}
      canDelete={false}
      isLoading={isRulesetLoading || isEntityLoading}
    >
      {ability && (
        <Card sx={{ boxShadow: 2, borderRadius: 2, border: 1, borderColor: "divider" }}>
          <CardContent sx={{ p: 0 }}>
            <Box sx={{ p: { xs: 2, sm: 3 }, pb: 2, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }}>
              <Typography variant="h6" sx={{ fontWeight: 600, color: "primary.main" }}>
                Ability Details
              </Typography>
            </Box>
            <Box sx={{ p: { xs: 2, sm: 3 } }}>
              <Typography
                variant="body1"
                sx={{
                  color: "text.secondary",
                  lineHeight: 1.6
                }}>
                {ability.description || "No description provided."}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      )}
    </EntityDetailLayout>
  );
}
