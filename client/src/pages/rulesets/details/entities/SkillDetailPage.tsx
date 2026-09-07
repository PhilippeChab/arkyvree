import { EntityDetailLayout } from "@/client/src/pages/rulesets/components/index.ts";
import { DeleteDialog, DiceSpinner } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { usePermissions } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import {
  SkillFormFields,
  type SkillFormData,
} from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { Box, Button, Card, CardContent, Chip, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate, useParams } from "react-router-dom";

type AbilitiesResponse = InferResponseType<(typeof rpc.api.rulesets)[":id"]["abilities"]["$get"]>;
type AbilitiesPaginated = Exclude<AbilitiesResponse, { error: string }>;
type Ability = AbilitiesPaginated["items"][number];

export default function SkillDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { id: rulesetId, skillId } = useParams<{ id: string; skillId: string }>();
  const backUrl = (location.state as { from?: string })?.from ?? `/rulesets/${rulesetId}/skills`;
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const editForm = useForm<SkillFormData>();

  const { data: ruleset, isLoading: isRulesetLoading } = useQuery({
    queryKey: queryKeys.rulesets.detail(rulesetId!),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].$get({ param: { id: rulesetId! } });
      if (!response.ok) throw new Error("Failed to fetch ruleset");
      return response.json();
    },
    enabled: !!rulesetId,
  });

  const { data: skill, isLoading: isEntityLoading } = useQuery({
    queryKey: queryKeys.rulesets.entity(rulesetId!, "skills", skillId!),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].skills[":skillId"].$get({
        param: { id: rulesetId!, skillId: skillId! },
      });
      if (!response.ok) throw new Error("Failed to fetch skill");
      return response.json();
    },
    enabled: !!rulesetId && !!skillId,
  });

  usePageTitle(skill?.name);

  const { data: abilitiesData } = useQuery({
    queryKey: queryKeys.rulesets.section(rulesetId!, "abilities"),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].abilities.$get({
        param: { id: rulesetId! },
        query: { limit: "100", page: "1" },
      });
      if (!response.ok) throw new Error("Failed to fetch abilities");
      return response.json();
    },
    enabled: !!rulesetId,
  });

  const abilities: Ability[] = abilitiesData?.items ?? [];

  const { canEdit, canDelete } = usePermissions(
    ruleset ?? { userId: null, status: undefined },
    currentUserId,
  );

  useEffect(() => {
    if (skill) {
      editForm.reset({
        name: skill.name,
        description: skill.description ?? undefined,
        primaryAbilityId: skill.primaryAbilityId,
        impactedByWeight: skill.impactedByWeight,
        usableWithoutTraining: skill.usableWithoutTraining,
      });
    }
  }, [skill, editForm]);

  const updateMutation = useMutation({
    mutationFn: async (data: SkillFormData) => {
      const response = await rpc.api.rulesets[":id"].skills[":skillId"].$put({
        param: { id: rulesetId!, skillId: skillId! },
        json: { ...data, updatedAt: skill?.updatedAt },
      });
      if (!response.ok) throw new Error("Failed to update skill");
      return response.json();
    },
    onSuccess: (data) => {
      const newId = (data as { id: string }).id;
      queryClient.setQueryData(queryKeys.rulesets.entity(rulesetId!, "skills", newId), data);
      if (newId !== skillId) {
        navigate(`/rulesets/${rulesetId}/skills/${newId}`, { replace: true, state: location.state });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(rulesetId!, "skills") });
      snackbar.success("Skill updated");
    },
    onError: (err) => snackbar.error(err, "Failed to update skill"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await rpc.api.rulesets[":id"].skills[":skillId"].$delete({
        param: { id: rulesetId!, skillId: skillId! },
      });
      if (!response.ok) throw new Error("Failed to delete skill");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(rulesetId!, "skills") });
      snackbar.success("Skill deleted");
      navigate(backUrl);
    },
    onError: (err) => snackbar.error(err, "Failed to delete skill"),
  });

  const primaryAbilityName = abilities.find((a) => a.id === skill?.primaryAbilityId)?.name;

  return (
    <>
      <EntityDetailLayout
        entityName={skill?.name}
        rulesetName={ruleset?.name}
        onBack={() => navigate(backUrl)}
        canDelete={canDelete}
        onDelete={() => setDeleteDialogOpen(true)}
        isLoading={isRulesetLoading || isEntityLoading}
      >
        {skill && (
          <Card sx={{ boxShadow: 2, borderRadius: 2, border: 1, borderColor: "divider" }}>
            <CardContent sx={{ p: 0 }}>
              <Box sx={{ p: { xs: 2, sm: 3 }, pb: 2, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: "primary.main" }}>
                    Skill Details
                  </Typography>
                  {!canEdit && (
                    <Box sx={{ display: "flex", gap: 1 }}>
                      {primaryAbilityName && (
                        <Chip label={primaryAbilityName} size="medium" color="secondary" variant="filled" sx={{ fontWeight: 600 }} />
                      )}
                      {!skill.usableWithoutTraining && (
                        <Chip label="Trained Only" size="medium" color="warning" />
                      )}
                      {skill.impactedByWeight && (
                        <Chip label="Weight Penalty" size="medium" color="info" variant="outlined" />
                      )}
                    </Box>
                  )}
                </Box>
              </Box>
              <Box sx={{ p: { xs: 2, sm: 3 } }}>
                {canEdit ? (
                  <form onSubmit={editForm.handleSubmit((data) => updateMutation.mutate(data))}>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <SkillFormFields form={editForm} abilities={abilities} />
                      <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                        <Button type="submit" variant="contained" disabled={!editForm.formState.isDirty || updateMutation.isPending}>
                          <DiceSpinner size="small" loading={updateMutation.isPending}>Save</DiceSpinner>
                        </Button>
                      </Box>
                    </Box>
                  </form>
                ) : (
                  <Typography
                    variant="body1"
                    sx={{
                      color: "text.secondary",
                      lineHeight: 1.6
                    }}>
                    {skill.description || "No description provided."}
                  </Typography>
                )}
              </Box>
            </CardContent>
          </Card>
        )}
      </EntityDetailLayout>
      <DeleteDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title="Delete Skill"
        message="Are you sure you want to delete this skill? This action cannot be undone."
        onConfirm={() => deleteMutation.mutate()}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
