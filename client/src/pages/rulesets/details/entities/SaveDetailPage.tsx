import { EntityDetailLayout } from "@/client/src/pages/rulesets/components/index.ts";
import { DeleteDialog, DiceSpinner } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { usePermissions } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import {
  SaveFormFields,
  type SaveFormData,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
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

export default function SaveDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { id: rulesetId, saveId } = useParams<{ id: string; saveId: string }>();
  const backUrl = (location.state as { from?: string })?.from ?? `/rulesets/${rulesetId}/saves`;
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const editForm = useForm<SaveFormData>();

  const { data: ruleset, isLoading: isRulesetLoading } = useQuery({
    queryKey: queryKeys.rulesets.detail(rulesetId!),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].$get({ param: { id: rulesetId! } });
      if (!response.ok) throw new Error("Failed to fetch ruleset");
      return response.json();
    },
    enabled: !!rulesetId,
  });

  const { data: save, isLoading: isEntityLoading } = useQuery({
    queryKey: queryKeys.rulesets.entity(rulesetId!, "saves", saveId!),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].saves[":saveId"].$get({
        param: { id: rulesetId!, saveId: saveId! },
      });
      if (!response.ok) throw new Error("Failed to fetch save");
      return response.json();
    },
    enabled: !!rulesetId && !!saveId,
  });

  usePageTitle(save?.name);

  const { data: abilitiesData } = useQuery({
    queryKey: queryKeys.rulesets.section(rulesetId!, "abilities"),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].abilities.$get({
        param: { id: rulesetId! },
        query: { limit: "100" },
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
    if (save) {
      editForm.reset({
        name: save.name,
        description: save.description ?? undefined,
        abilityId: save.abilityId,
      });
    }
  }, [save, editForm]);

  const updateMutation = useMutation({
    mutationFn: async (data: SaveFormData) => {
      const response = await rpc.api.rulesets[":id"].saves[":saveId"].$put({
        param: { id: rulesetId!, saveId: saveId! },
        json: { ...data, updatedAt: save?.updatedAt },
      });
      if (!response.ok) throw new Error("Failed to update save");
      return response.json();
    },
    onSuccess: (data) => {
      const newId = (data as { id: string }).id;
      queryClient.setQueryData(queryKeys.rulesets.entity(rulesetId!, "saves", newId), data);
      if (newId !== saveId) {
        navigate(`/rulesets/${rulesetId}/saves/${newId}`, { replace: true, state: location.state });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(rulesetId!, "saves") });
      snackbar.success("Save updated");
    },
    onError: (err) => snackbar.error(err, "Failed to update save"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await rpc.api.rulesets[":id"].saves[":saveId"].$delete({
        param: { id: rulesetId!, saveId: saveId! },
      });
      if (!response.ok) throw new Error("Failed to delete save");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(rulesetId!, "saves") });
      snackbar.success("Save deleted");
      navigate(backUrl);
    },
    onError: (err) => snackbar.error(err, "Failed to delete save"),
  });

  const linkedAbilityName = abilities.find((a) => a.id === save?.abilityId)?.name;

  return (
    <>
      <EntityDetailLayout
        entityName={save?.name}
        rulesetName={ruleset?.name}
        onBack={() => navigate(backUrl)}
        canDelete={canDelete}
        onDelete={() => setDeleteDialogOpen(true)}
        isLoading={isRulesetLoading || isEntityLoading}
      >
        {save && (
          <Card sx={{ boxShadow: 2, borderRadius: 2, border: 1, borderColor: "divider" }}>
            <CardContent sx={{ p: 0 }}>
              <Box sx={{ p: { xs: 2, sm: 3 }, pb: 2, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: "primary.main" }}>
                    Save Details
                  </Typography>
                  {!canEdit && linkedAbilityName && (
                    <Chip label={linkedAbilityName} size="medium" color="secondary" variant="filled" sx={{ fontWeight: 600 }} />
                  )}
                </Box>
              </Box>
              <Box sx={{ p: { xs: 2, sm: 3 } }}>
                {canEdit ? (
                  <form onSubmit={editForm.handleSubmit((data) => updateMutation.mutate(data))}>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <SaveFormFields form={editForm} abilities={abilities} />
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
                    {save.description || "No description provided."}
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
        title="Delete Save"
        message="Are you sure you want to delete this save? This action cannot be undone."
        onConfirm={() => deleteMutation.mutate()}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
