import {
  ModifierForm,
  TargetPathBreadcrumbs,
} from "@/client/src/components/customization/index.ts";
import { MODIFIER_OPERATOR_LABELS } from "@/client/src/lib/operatorLabels.ts";
import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import {
  CreateDialog,
  DeleteDialog,
  EditDialog,
} from "@/client/src/components/common/index.ts";
import {
  usePermissions,
  useRulesetSection,
} from "@/client/src/pages/rulesets/hooks/index.ts";
import { extractTemplatePath } from "@/client/src/lib/templateValues.ts";
import type { BaseEntityType } from "@/client/src/pages/rulesets/customization/types.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { Add as AddIcon, Tune as ModifiersIcon } from "@mui/icons-material";
import { Box, Button, Chip, Typography } from "@mui/material";
import type { InferRequestType, InferResponseType } from "hono/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";

const MODIFIERS_COLUMNS = [
  { key: "target", label: "Target", width: "30%" },
  { key: "operator", label: "Operator", width: "10%" },
  { key: "value", label: "Value", width: "25%" },
  { key: "createdAt", label: "Created", width: "20%" },
];

type ModifiersResponse = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["modifiers"]["$get"]
>;
type ModifiersArray = Exclude<ModifiersResponse, { error: string }>;
type Modifier = ModifiersArray[number];

type ModifierFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["modifiers"]["$post"]
>["json"];

interface ModifiersSectionProps {
  ruleset: {
    id: string;
    name: string;
    userId?: string | null;
    status?: string;
  };
  entityType: BaseEntityType;
  entityId: string;
  data?: Modifier[];
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
  onEntityIdChange?: (newEntityId: string) => void;
}

export function ModifiersSection({
  ruleset,
  entityType,
  entityId,
  data: externalData,
  queryKeysToInvalidate,
  onEntityIdChange,
}: ModifiersSectionProps) {
  const navigate = useNavigate();

  const handleResolvedEntityId = useMemo(() => (data: unknown) => {
    const resolved = (data as { resolvedEntityId?: string }).resolvedEntityId;
    if (resolved && resolved !== entityId) {
      onEntityIdChange?.(resolved);
    }
  }, [entityId, onEntityIdChange]);

  const {
    data: modifiers,
    isLoading,
    currentUserId,
    createDialogOpen,
    editDialogOpen,
    deleteDialogOpen,
    setCreateDialogOpen,
    setEditDialogOpen,
    setDeleteDialogOpen,
    selectedItem: selectedModifier,
    createForm,
    editForm,
    createMutation,
    updateMutation,
    deleteMutation,
    handleCreate,
    handleEdit,
    handleDelete,
    confirmDelete,
  } = useRulesetSection<Modifier, ModifierFormData>({
    rulesetId: ruleset.id,
    sectionName: `customization-${entityType}-${entityId}-modifiers`,
    label: "Modifier",
    data: externalData,
    queryFn: !externalData ? async () => {
      const response = await rpc.api.rulesets[":id"].customization[
        ":entityType"
      ][":entityId"].modifiers.$get({
        param: { id: ruleset.id, entityType, entityId },
      });
      if (!response.ok) throw new Error("Failed to fetch modifiers");
      return response.json();
    } : undefined,
    queryKeysToInvalidate,
    createFn: async (data: ModifierFormData) => {
      const response = await rpc.api.rulesets[":id"].customization[
        ":entityType"
      ][":entityId"].modifiers.$post({
        param: { id: ruleset.id, entityType: entityType, entityId: entityId },
        json: data,
      });
      if (!response.ok) throw new Error("Failed to create modifier");
      return response.json();
    },
    updateFn: async (modifierId: string, data: ModifierFormData) => {
      const response = await rpc.api.rulesets[":id"].customization[
        ":entityType"
      ][":entityId"].modifiers[":modifierId"].$put({
        param: {
          id: ruleset.id,
          entityType: entityType,
          entityId: entityId,
          modifierId: modifierId,
        },
        json: data,
      });
      if (!response.ok) throw new Error("Failed to update modifier");
      return response.json();
    },
    deleteFn: async (modifierId: string) => {
      const response = await rpc.api.rulesets[":id"].customization[
        ":entityType"
      ][":entityId"].modifiers[":modifierId"].$delete({
        param: {
          id: ruleset.id,
          entityType: entityType,
          entityId: entityId,
          modifierId: modifierId,
        },
      });
      if (!response.ok) throw new Error("Failed to delete modifier");
      return response.json();
    },
    onCreateSuccess: handleResolvedEntityId,
    onUpdateSuccess: handleResolvedEntityId,
    onDeleteSuccess: handleResolvedEntityId,
  });

  const { canEdit } = usePermissions(ruleset, currentUserId);
  const canDelete = canEdit;

  const handleEditModifier = (modifier: Modifier) => {
    handleEdit(modifier, {
      target: modifier.target,
      value: modifier.value,
      operator: modifier.operator,
    });
  };

  const [duplicateSourceId, setDuplicateSourceId] = useState<string | null>(null);

  const handleDuplicateModifier = (modifier: Modifier) => {
    createForm.reset({
      target: modifier.target,
      value: modifier.value,
      operator: modifier.operator,
    }, { keepDefaultValues: true });
    setDuplicateSourceId(modifier.id);
    setCreateDialogOpen(true);
  };

  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const duplicateMutation = useMutation({
    mutationFn: async ({ sourceId, data }: { sourceId: string; data: ModifierFormData }) => {
      const response = await rpc.api.rulesets[":id"].customization[
        ":entityType"
      ][":entityId"].modifiers[":modifierId"].duplicate.$post({
        param: {
          id: ruleset.id,
          entityType,
          entityId,
          modifierId: sourceId,
        },
        json: data,
      });
      if (!response.ok) throw new Error("Failed to duplicate modifier");
      return response.json();
    },
    onSuccess: (data) => {
      snackbar.success("Modifier created successfully");
      queryClient.invalidateQueries({
        queryKey: queryKeys.rulesets.section(
          ruleset.id,
          `customization-${entityType}-${entityId}-modifiers`,
        ),
      });
      for (const queryKey of queryKeysToInvalidate ?? []) {
        queryClient.invalidateQueries({ queryKey });
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.changes(ruleset.id) });
      setCreateDialogOpen(false);
      setDuplicateSourceId(null);
      createForm.reset();
      handleResolvedEntityId(data);
    },
    onError: (err: Error) => {
      snackbar.error(err, "Failed to duplicate modifier");
    },
  });

  const handleRowClick = (modifier: Modifier) => {
    navigate(
      `/rulesets/${ruleset.id}/modifiers/${modifier.id}/customization/requirements`,
    );
  };

  const handleRowMouseEnter = useCallback(
    (modifier: Modifier) => {
      queryClient.prefetchQuery({
        queryKey: queryKeys.rulesets.entity(ruleset.id, "modifiers", modifier.id),
        queryFn: async () => {
          const response = await rpc.api.rulesets[":id"].customization[
            ":entityType"
          ][":entityId"].modifiers[":modifierId"].$get({
            param: {
              id: ruleset.id,
              entityType,
              entityId,
              modifierId: modifier.id,
            },
          });
          if (!response.ok) throw new Error("Failed to fetch modifier");
          const data = await response.json();
          return {
            ...data,
            name: `${data.target} ${data.operator} ${data.value}`,
          };
        },
      });
    },
    [queryClient, ruleset.id, entityType, entityId],
  );

  const renderCell = (modifier: Modifier, columnKey: string) => {
    switch (columnKey) {
      case "target":
        return (
          <TargetPathBreadcrumbs
            target={modifier.target}
            targetLabels={modifier.targetLabels}
          />
        );
      case "value": {
        const templatePath = extractTemplatePath(modifier.value);
        if (templatePath) {
          return (
            <TargetPathBreadcrumbs target={templatePath} targetLabels={modifier.targetLabels} />
          );
        }
        return <Typography variant="body2">{modifier.valueLabel || modifier.value}</Typography>;
      }
      case "operator":
        return (
          <Chip
            label={
              MODIFIER_OPERATOR_LABELS[modifier.operator] || modifier.operator
            }
            size="small"
            color="secondary"
            variant="outlined"
          />
        );
      case "createdAt":
        return (
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {new Date(modifier.createdAt).toLocaleDateString()}
          </Typography>
        );
      default:
        return null;
    }
  };

  return (
    <Box sx={{ width: "100%", maxWidth: 1200, margin: "0 auto" }}>
      {canEdit && (
        <Box sx={{ mb: 2, display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              createForm.reset();
              setDuplicateSourceId(null);
              handleCreate();
            }}
          >
            Add Modifier
          </Button>
        </Box>
      )}

      <RulesetSectionTable
        data={modifiers}
        isLoading={isLoading}
        columns={MODIFIERS_COLUMNS}
        canEdit={canEdit}
        canDelete={canDelete}
        onEdit={handleEditModifier}
        onDelete={handleDelete}
        onDuplicate={handleDuplicateModifier}
        onRowClick={handleRowClick}
        onRowMouseEnter={handleRowMouseEnter}
        renderCell={renderCell}
        emptyIcon={
          <ModifiersIcon
            sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }}
          />
        }
        emptyTitle="No modifiers"
        emptyDescription="No modifiers defined for this entity."
      />

      <CreateDialog
        open={createDialogOpen}
        onClose={() => {
          setCreateDialogOpen(false);
          setDuplicateSourceId(null);
        }}
        title="Create New Modifier"
        form={createForm}
        onSubmit={(data) => {
          if (duplicateSourceId) {
            duplicateMutation.mutate({ sourceId: duplicateSourceId, data });
          } else {
            createMutation.mutate(data);
          }
        }}
        isLoading={createMutation.isPending || duplicateMutation.isPending}
        maxWidth="md"
      >
        <ModifierForm form={createForm} rulesetId={ruleset.id} entityType={entityType} mode="create" />
      </CreateDialog>

      <EditDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        title="Edit Modifier"
        form={editForm}
        onSubmit={(data) =>
          selectedModifier && updateMutation.mutate({ id: selectedModifier.id, data })
        }
        isLoading={updateMutation.isPending}
        maxWidth="md"
      >
        <ModifierForm form={editForm} rulesetId={ruleset.id} entityType={entityType} mode="edit" />
      </EditDialog>

      <DeleteDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title="Delete Modifier"
        message="Are you sure you want to delete this modifier? This action cannot be undone."
        onConfirm={confirmDelete}
        isLoading={deleteMutation.isPending}
      />
    </Box>
  );
}
