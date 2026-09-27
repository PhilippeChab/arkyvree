import type { RulesetDetail } from "@/client/src/lib/queries.ts";
import {
  PropertyTypeInput,
  PropertyValueInput,
} from "@/client/src/components/customization/index.ts";
import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { CreateDialog, DeleteDialog, EditDialog, DescriptionField, SectionContent } from "@/client/src/components/common/index.ts";
import { useRulesetPermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import type { BaseEntityType } from "@/client/src/pages/rulesets/customization/types.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { ListAlt as PropertiesIcon } from "@mui/icons-material";
import { Chip, Typography } from "@mui/material";
import type { InferRequestType, InferResponseType } from "hono/client";
import { SectionAddButton } from "./SectionAddButton.tsx";
import { useCopyFollow } from "./useCopyFollow.ts";

const PROPERTIES_COLUMNS = [
  { key: "type", label: "Type", width: "20%" },
  { key: "value", label: "Value", width: "40%" },
  { key: "description", label: "Description", width: "40%" },
];

type PropertiesArray = InferResponseType<(typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["properties"][
  "$get"
  ], 200>;
type Property = PropertiesArray[number];

type PropertyFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["properties"][
  "$post"
  ]
>["json"];

interface PropertiesSectionProps {
  ruleset: RulesetDetail;
  entityType: BaseEntityType;
  entityId: string;
  data?: Property[];
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
  onEntityIdChange?: (copyId: string, sourceId: string) => void;
}

export function PropertiesSection(
  { ruleset, entityType, entityId, data: externalData, queryKeysToInvalidate, onEntityIdChange }: PropertiesSectionProps,
) {
  const { tag, followCopies } = useCopyFollow(entityId, onEntityIdChange);
  const entityParam = { id: ruleset.id, entityType, entityId };

  const {
    data: properties,
    isLoading,
    editDialogOpen,
    deleteDialogOpen,
    setEditDialogOpen,
    setDeleteDialogOpen,
    selectedItem: selectedProperty,
    createForm,
    editForm,
    updateMutation,
    deleteMutation,
    handleCreate,
    handleEdit,
    handleDelete,
    confirmDelete,
    createDialogProps,
  } = useRulesetSection({
    rulesetId: ruleset.id,
    sectionName: `customization-${entityType}-${entityId}-properties`,
    label: "Property",
    data: externalData,
    queryKeysToInvalidate,
    createFn: async (data: PropertyFormData) => {
      return tag(parseResponse(rpc.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .properties.$post({
          param: entityParam,
          json: data,
        })));
    },
    updateFn: async (propertyId: string, data: PropertyFormData) => {
      return tag(parseResponse(rpc.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .properties[":property_id"].$put({
          param: { ...entityParam, property_id: propertyId },
          json: data,
        })));
    },
    deleteFn: async (propertyId: string) => {
      return tag(parseResponse(rpc.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .properties[":property_id"].$delete({
          param: { ...entityParam, property_id: propertyId },
        })));
    },
    ...followCopies,
  });

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
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
          : <Typography variant="body2" sx={{ color: "text.secondary" }}>—</Typography>;
      case "description":
        return (
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {property.description}
          </Typography>
        );
      default:
        return null;
    }
  };

  return (
    <SectionContent>
      {canEdit && <SectionAddButton label="Add Property" onClick={handleCreate} />}

      <RulesetSectionTable
        data={properties}
        isLoading={isLoading}
        columns={PROPERTIES_COLUMNS}
        canEdit={canEdit}
        canDelete={canDelete}
        onEdit={handleEditProperty}
        onDelete={handleDelete}
        renderCell={renderCell}
        emptyIcon={PropertiesIcon}
        emptyTitle="No properties"
        emptyDescription="No properties defined for this entity."
      />

      <CreateDialog
        {...createDialogProps}
        title="Create New Property"
        fixedHeight="40vh"
      >
        <PropertyTypeInput
          value={createForm.watch("type") || ""}
          onChange={(value: string) => createForm.setValue("type", value)}
          rulesetId={ruleset.id}
          entityType={entityType}
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
        <DescriptionField
          {...createForm.register("description")}
          placeholder="Enter the property description..."
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
          entityType={entityType}
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
        <DescriptionField
          {...editForm.register("description")}
          placeholder="Enter the property description..."
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
    </SectionContent>
  );
}
