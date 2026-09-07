import { EntityDetailLayout } from "@/client/src/pages/rulesets/components/index.ts";
import { DeleteDialog, DiceSpinner } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { usePermissions } from "@/client/src/pages/rulesets/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import {
  MechanicFormFields,
  type MechanicFormData,
} from "@/client/src/pages/rulesets/components/forms/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { Box, Button, Card, CardContent, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate, useParams } from "react-router-dom";

export default function MechanicDetailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const { id: rulesetId, mechanicId } = useParams<{ id: string; mechanicId: string }>();
  const backUrl = (location.state as { from?: string })?.from ?? `/rulesets/${rulesetId}/mechanics`;
  const currentUserId = useAuthStore((s) => s.user?.id);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const editForm = useForm<MechanicFormData>();

  const { data: ruleset, isLoading: isRulesetLoading } = useQuery({
    queryKey: queryKeys.rulesets.detail(rulesetId!),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].$get({ param: { id: rulesetId! } });
      if (!response.ok) throw new Error("Failed to fetch ruleset");
      return response.json();
    },
    enabled: !!rulesetId,
  });

  const { data: mechanic, isLoading: isEntityLoading } = useQuery({
    queryKey: queryKeys.rulesets.entity(rulesetId!, "mechanics", mechanicId!),
    queryFn: async () => {
      const response = await rpc.api.rulesets[":id"].mechanics[":mechanicId"].$get({
        param: { id: rulesetId!, mechanicId: mechanicId! },
      });
      if (!response.ok) throw new Error("Failed to fetch mechanic");
      return response.json();
    },
    enabled: !!rulesetId && !!mechanicId,
  });

  usePageTitle(mechanic?.name);

  const { canEdit, canDelete } = usePermissions(
    ruleset ?? { userId: null, status: undefined },
    currentUserId,
  );

  useEffect(() => {
    if (mechanic) {
      editForm.reset({
        name: mechanic.name,
        description: mechanic.description ?? undefined,
      });
    }
  }, [mechanic, editForm]);

  const updateMutation = useMutation({
    mutationFn: async (data: MechanicFormData) => {
      const response = await rpc.api.rulesets[":id"].mechanics[":mechanicId"].$put({
        param: { id: rulesetId!, mechanicId: mechanicId! },
        json: { ...data, updatedAt: mechanic?.updatedAt },
      });
      if (!response.ok) throw new Error("Failed to update mechanic");
      return response.json();
    },
    onSuccess: (data) => {
      const newId = (data as { id: string }).id;
      queryClient.setQueryData(queryKeys.rulesets.entity(rulesetId!, "mechanics", newId), data);
      if (newId !== mechanicId) {
        navigate(`/rulesets/${rulesetId}/mechanics/${newId}`, { replace: true, state: location.state });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(rulesetId!, "mechanics") });
      snackbar.success("Mechanic updated");
    },
    onError: (err) => snackbar.error(err, "Failed to update mechanic"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const response = await rpc.api.rulesets[":id"].mechanics[":mechanicId"].$delete({
        param: { id: rulesetId!, mechanicId: mechanicId! },
      });
      if (!response.ok) throw new Error("Failed to delete mechanic");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(rulesetId!, "mechanics") });
      snackbar.success("Mechanic deleted");
      navigate(backUrl);
    },
    onError: (err) => snackbar.error(err, "Failed to delete mechanic"),
  });

  return (
    <>
      <EntityDetailLayout
        entityName={mechanic?.name}
        rulesetName={ruleset?.name}
        onBack={() => navigate(backUrl)}
        canDelete={canDelete}
        onDelete={() => setDeleteDialogOpen(true)}
        isLoading={isRulesetLoading || isEntityLoading}
      >
        {mechanic && (
          <Card sx={{ boxShadow: 2, borderRadius: 2, border: 1, borderColor: "divider" }}>
            <CardContent sx={{ p: 0 }}>
              <Box sx={{ p: { xs: 2, sm: 3 }, pb: 2, borderBottom: 1, borderColor: "divider", bgcolor: "action.hover" }}>
                <Typography variant="h6" sx={{ fontWeight: 600, color: "primary.main" }}>
                  Mechanic Details
                </Typography>
              </Box>
              <Box sx={{ p: { xs: 2, sm: 3 } }}>
                {canEdit ? (
                  <form onSubmit={editForm.handleSubmit((data) => updateMutation.mutate(data))}>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <MechanicFormFields form={editForm} />
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
                      lineHeight: 1.6,
                      whiteSpace: "pre-wrap"
                    }}>
                    {mechanic.description || "No description provided."}
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
        title="Delete Mechanic"
        message="Are you sure you want to delete this mechanic? This action cannot be undone."
        onConfirm={() => deleteMutation.mutate()}
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
