import {
  PropertyTypeInput,
  PropertyValueInput,
} from "@/client/src/components/customization/index.ts";
import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { CreateDialog, DeleteDialog, EditDialog } from "@/client/src/components/common/index.ts";
import { usePermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import type { BaseEntityType } from "@/client/src/pages/rulesets/customization/types.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import type { EntityType } from "@/shared/customization/properties.ts";
import { Add as AddIcon, ListAlt as PropertiesIcon } from "@mui/icons-material";
import { Box, Button, Chip, TextField, Typography } from "@mui/material";
import type { InferRequestType, InferResponseType } from "hono/client";
import { useMemo } from "react";

const PROPERTIES_COLUMNS = [
  { key: "type", label: "Type", width: "20%" },
  { key: "value", label: "Value", width: "40%" },
  { key: "description", label: "Description", width: "40%" },
];

type PropertiesResponse = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["properties"][
  "$get"
  ]
>;
type PropertiesArray = Exclude<PropertiesResponse, { error: string }>;
type Property = PropertiesArray[number];

type PropertyFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["properties"][
  "$post"
  ]
>["json"];

interface PropertiesSectionProps {
  ruleset: {
    id: string;
    name: string;
    userId?: string | null;
    status?: string;
  };
  entityType: BaseEntityType;
  entityId: string;
  data?: Property[];
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
  onEntityIdChange?: (newEntityId: string) => void;
}

export function PropertiesSection(
  { ruleset, entityType, entityId, data: externalData, queryKeysToInvalidate, onEntityIdChange }: PropertiesSectionProps,
) {
  const handleResolvedEntityId = useMemo(() => (data: unknown) => {
    const resolved = (data as { resolvedEntityId?: string }).resolvedEntityId;
    if (resolved && resolved !== entityId) {
      onEntityIdChange?.(resolved);
    }
  }, [entityId, onEntityIdChange]);

  const {
    data: properties,
    isLoading,
    currentUserId,
    createDialogOpen,
    editDialogOpen,
    deleteDialogOpen,
    setCreateDialogOpen,
    setEditDialogOpen,
    setDeleteDialogOpen,
    selectedItem: selectedProperty,
    createForm,
    editForm,
    createMutation,
    updateMutation,
    deleteMutation,
    handleCreate,
    handleEdit,
    handleDelete,
    confirmDelete,
  } = useRulesetSection<Property, PropertyFormData>({
    rulesetId: ruleset.id,
    sectionName: `customization-${entityType}-${entityId}-properties`,
    label: "Property",
    data: externalData,
    queryKeysToInvalidate,
    createFn: async (data: PropertyFormData) => {
      const response = await rpc.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .properties.$post({
          param: { id: ruleset.id, entityType: entityType, entityId: entityId },
          json: data,
        });
      if (!response.ok) throw new Error("Failed to create property");
      return response.json();
    },
    updateFn: async (propertyId: string, data: PropertyFormData) => {
      const response = await rpc.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .properties[":property_id"].$put({
          param: {
            id: ruleset.id,
            entityType: entityType,
            entityId: entityId,
            property_id: propertyId,
          },
          json: data,
        });
      if (!response.ok) throw new Error("Failed to update property");
      return response.json();
    },
    deleteFn: async (propertyId: string) => {
      const response = await rpc.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .properties[":property_id"].$delete({
          param: {
            id: ruleset.id,
            entityType: entityType,
            entityId: entityId,
            property_id: propertyId,
          },
        });
      if (!response.ok) throw new Error("Failed to delete property");
      return response.json();
    },
    onCreateSuccess: handleResolvedEntityId,
    onUpdateSuccess: handleResolvedEntityId,
    onDeleteSuccess: handleResolvedEntityId,
  });

  const { canEdit } = usePermissions(ruleset, currentUserId);
  const canDelete = canEdit;

  const handleEditProperty = (property: Property) => {
    handleEdit(property, {
      value: property.value,
      type: property.type || "",
      description: property.description || "",
    });
  };

  const renderCell = (property: Property, columnKey: string) => {
    switch (columnKey) {
      case "value":
        return (
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {property.value}
          </Typography>
        );
      case "type":
        return property.type
          ? (
            <Chip
              label={property.type}
              size="small"
              color="primary"
              variant="outlined"
            />
          )
          : <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>—</Typography>;
      case "description":
        return (
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            {property.description}
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
            onClick={handleCreate}
          >
            Add Property
          </Button>
        </Box>
      )}

      <RulesetSectionTable
        data={properties}
        isLoading={isLoading}
        columns={PROPERTIES_COLUMNS}
        canEdit={canEdit}
        canDelete={canDelete}
        onEdit={handleEditProperty}
        onDelete={handleDelete}
        renderCell={renderCell}
        emptyIcon={<PropertiesIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
        emptyTitle="No properties"
        emptyDescription="No properties defined for this entity."
      />

      <CreateDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        title="Create New Property"
        form={createForm}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
        fixedHeight="40vh"
      >
        <PropertyTypeInput
          value={createForm.watch("type") || ""}
          onChange={(value: string) => createForm.setValue("type", value)}
          rulesetId={ruleset.id}
          entityType={entityType as EntityType}
          label="Type"
          placeholder="e.g., tag, category, note"
          fullWidth
        />
        <input type="hidden" {...createForm.register("value", { required: "Value is required" })} />
        <PropertyValueInput
          value={createForm.watch("value") || ""}
          onChange={(value: string) => createForm.setValue("value", value, { shouldValidate: true })}
          rulesetId={ruleset.id}
          propertyType={createForm.watch("type") || ""}
          label="Value"
          required
          fullWidth
          placeholder="Enter the property value..."
          error={!!createForm.formState.errors.value}
          helperText={createForm.formState.errors.value?.message}
        />
        <TextField
          {...createForm.register("description")}
          label="Description"
          fullWidth
          multiline
          minRows={3}
          placeholder="Enter the property description..."
          sx={{ "& textarea": { resize: "vertical" } }}
        />
      </CreateDialog>

      <EditDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        title="Edit Property"
        form={editForm}
        onSubmit={(data) =>
          selectedProperty && updateMutation.mutate({ id: selectedProperty.id, data })}
        isLoading={updateMutation.isPending}
        fixedHeight="60vh"
      >
        <PropertyTypeInput
          value={editForm.watch("type") || ""}
          onChange={(value: string) => editForm.setValue("type", value)}
          rulesetId={ruleset.id}
          entityType={entityType as EntityType}
          label="Type"
          placeholder="e.g., tag, category, note"
          fullWidth
        />
        <input type="hidden" {...editForm.register("value", { required: "Value is required" })} />
        <PropertyValueInput
          value={editForm.watch("value") || ""}
          onChange={(value: string) => editForm.setValue("value", value, { shouldValidate: true })}
          rulesetId={ruleset.id}
          propertyType={editForm.watch("type") || ""}
          label="Value"
          required
          fullWidth
          placeholder="Enter the property value..."
          error={!!editForm.formState.errors.value}
          helperText={editForm.formState.errors.value?.message}
        />
        <TextField
          {...editForm.register("description")}
          label="Description"
          fullWidth
          multiline
          minRows={3}
          placeholder="Enter the property description..."
          sx={{ "& textarea": { resize: "vertical" } }}
        />
      </EditDialog>

      <DeleteDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title="Delete Property"
        message="Are you sure you want to delete this property? This action cannot be undone."
        onConfirm={confirmDelete}
        isLoading={deleteMutation.isPending}
      />
    </Box>
  );
}
