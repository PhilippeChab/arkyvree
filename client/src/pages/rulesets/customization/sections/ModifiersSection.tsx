import { Chip, Typography } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { InferRequestType, InferResponseType } from "hono/client";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

import { CreateDialog, DeleteDialog, EditDialog, SectionContent } from "@/client/src/components/common/index.ts";
import { EMPTY_MODIFIER, ModifierForm, TargetPathBreadcrumbs } from "@/client/src/components/customization/index.ts";
import { ModifiersIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { formatDate } from "@/client/src/lib/formatDate.ts";
import { MODIFIER_OPERATOR_LABELS } from "@/client/src/lib/operatorLabels.ts";
import type { RulesetDetail } from "@/client/src/lib/queries.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { extractTemplatePath } from "@/client/src/lib/templateValues.ts";
import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { useRulesetPermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import type { CustomizableEntityType } from "@/shared/customization/entities.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import { SectionAddButton } from "./SectionAddButton.tsx";
import { useCopyFollow } from "./useCopyFollow.ts";

type ModifiersArray = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["modifiers"]["$get"],
  200
>;
type Modifier = ModifiersArray[number];

type ModifierFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["modifiers"]["$post"]
>["json"];

interface ModifiersSectionProps {
  ruleset: RulesetDetail;
  entityType: CustomizableEntityType;
  entityId: string;
  data?: Modifier[];
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
  onEntityIdChange?: (copyId: string, sourceId: string) => void;
}

const MODIFIERS_COLUMNS = [
  { key: "target", label: "Target", width: "30%" },
  { key: "operator", label: "Operator", width: "10%" },
  { key: "value", label: "Value", width: "25%" },
  { key: "createdAt", label: "Created", width: "20%" },
];

export function ModifiersSection({
  ruleset,
  entityType,
  entityId,
  data: externalData,
  queryKeysToInvalidate,
  onEntityIdChange,
}: ModifiersSectionProps) {
  const navigate = useNavigate();

  const { tag, follow: handleResolvedEntityId, followCopies } = useCopyFollow(entityId, onEntityIdChange);
  const entityParam = { id: ruleset.id, entityType: getUrlSegment(entityType), entityId };

  const {
    data: modifiers,
    isLoading,
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
  } = useRulesetSection({
    createDefaults: EMPTY_MODIFIER,
    rulesetId: ruleset.id,
    sectionName: `customization-${entityType}-${entityId}-modifiers`,
    label: "Modifier",
    data: externalData,
    queryFn: !externalData
      ? async () => {
          return parseResponse(
            rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers.$get({
              param: entityParam,
            }),
          );
        }
      : undefined,
    queryKeysToInvalidate,
    createFn: async (data: ModifierFormData) => {
      return tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers.$post({
            param: entityParam,
            json: data,
          }),
        ),
      );
    },
    updateFn: async (modifierId: string, data: ModifierFormData) => {
      return tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers[":modifierId"].$put({
            param: { ...entityParam, modifierId },
            json: data,
          }),
        ),
      );
    },
    deleteFn: async (modifierId: string) => {
      return tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers[":modifierId"].$delete({
            param: { ...entityParam, modifierId },
          }),
        ),
      );
    },
    ...followCopies,
  });

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  const canDelete = canEdit;

  const handleEditModifier = (modifier: Modifier) => {
    handleEdit(modifier, {
      target: modifier.target,
      value: modifier.value,
      operator: modifier.operator,
    });
  };

  const [duplicateSourceId, setDuplicateSourceId] = useState<string | null>(null);

  const handleAddModifier = () => {
    createForm.reset();
    setDuplicateSourceId(null);
    handleCreate();
  };

  const handleDuplicateModifier = (modifier: Modifier) => {
    createForm.reset(
      {
        target: modifier.target,
        value: modifier.value,
        operator: modifier.operator,
      },
      { keepDefaultValues: true },
    );
    setDuplicateSourceId(modifier.id);
    setCreateDialogOpen(true);
  };

  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const duplicateMutation = useMutation({
    mutationFn: async ({ sourceId, data }: { sourceId: string; data: ModifierFormData }) => {
      return tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers[":modifierId"].duplicate.$post({
            param: { ...entityParam, modifierId: sourceId },
            json: data,
          }),
        ),
      );
    },
    onSuccess: (data) => {
      snackbar.success("Modifier created successfully");
      queryClient.invalidateQueries({
        queryKey: queryKeys.rulesets.section(ruleset.id, `customization-${entityType}-${entityId}-modifiers`),
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
    navigate(`/rulesets/${ruleset.id}/modifiers/${modifier.id}/customization/requirements`);
  };

  const handleRowMouseEnter = useCallback(
    (modifier: Modifier) => {
      void queryClient.prefetchQuery(customizationEntityQuery(ruleset.id, "modifiers", modifier.id));
    },
    [queryClient, ruleset.id],
  );

  const renderCell = (modifier: Modifier, columnKey: string) => {
    switch (columnKey) {
      case "target":
        return <TargetPathBreadcrumbs target={modifier.target} targetLabels={modifier.targetLabels} />;
      case "value": {
        const templatePath = extractTemplatePath(modifier.value);
        if (templatePath) {
          return <TargetPathBreadcrumbs target={templatePath} targetLabels={modifier.targetLabels} />;
        }
        return <Typography variant="body2">{modifier.valueLabel || modifier.value}</Typography>;
      }
      case "operator":
        return (
          <Chip
            label={MODIFIER_OPERATOR_LABELS[modifier.operator] || modifier.operator}
            size="small"
            color="secondary"
            variant="outlined"
          />
        );
      case "createdAt":
        return (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {formatDate(modifier.createdAt)}
          </Typography>
        );
      default:
        return null;
    }
  };

  return (
    <SectionContent>
      {canEdit && <SectionAddButton label="Add Modifier" onClick={handleAddModifier} />}

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
        emptyIcon={ModifiersIcon}
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
        onSubmit={(data) => selectedModifier && updateMutation.mutate({ id: selectedModifier.id, data })}
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
    </SectionContent>
  );
}
