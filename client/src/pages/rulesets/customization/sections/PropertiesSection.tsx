import { Chip, Stack, Typography } from "@mui/material";
import { type InferRequestType, type InferResponseType, parseResponse } from "hono/client";
import { Controller } from "react-hook-form";

import {
  CreateDialog,
  DeleteDialog,
  DescriptionField,
  EditDialog,
  EmptyValue,
  SectionContent,
} from "@/client/src/components/common/index.ts";
import { PropertyTypeInput, PropertyValueInput } from "@/client/src/components/customization/index.ts";
import { ListAltIcon } from "@/client/src/components/icons/index.ts";
import type { RulesetDetail } from "@/client/src/lib/queries.ts";
import { requiredRules } from "@/client/src/lib/validation.ts";
import { RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import {
  customizationSection,
  propertiesQuery,
} from "@/client/src/pages/rulesets/customization/customizationQueries.ts";
import { useRulesetPermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import type { CustomizableEntityType } from "@/shared/customization/entities.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import { SectionAddButton } from "./SectionAddButton.tsx";
import { useCopyFollow } from "./useCopyFollow.ts";

type PropertiesArray = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["properties"]["$get"],
  200
>;
interface PropertiesSectionProps {
  data?: Property[];
  entityId: string;
  entityType: CustomizableEntityType;
  onEntityIdChange?: (copyId: string, sourceId: string) => void;
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
  ruleset: RulesetDetail;
}

type Property = PropertiesArray[number];

type PropertyFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["properties"]["$post"]
>["json"];

/** A property's form, empty: what the create dialog opens on. */
const EMPTY_PROPERTY: PropertyFormData = { type: "", value: "", description: "" };

const PROPERTIES_COLUMNS = [
  { key: "type", label: "Type", width: "20%" },
  { key: "value", label: "Value", width: "40%" },
  { key: "description", label: "Description", width: "40%" },
];

export function PropertiesSection({
  ruleset,
  entityType,
  entityId,
  data: externalData,
  queryKeysToInvalidate,
  onEntityIdChange,
}: PropertiesSectionProps) {
  const { tag, followCopies } = useCopyFollow(entityId, onEntityIdChange);
  const entityParam = { id: ruleset.id, entityType: getUrlSegment(entityType), entityId };

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
    createDefaults: EMPTY_PROPERTY,
    rulesetId: ruleset.id,
    sectionName: customizationSection(entityType, entityId, "properties"),
    label: "Property",
    data: externalData,
    query: propertiesQuery(ruleset.id, entityType, entityId),
    queryKeysToInvalidate,
    createFn: async (data: PropertyFormData) => {
      return tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].properties.$post({
            param: entityParam,
            json: data,
          }),
        ),
      );
    },
    updateFn: async (propertyId: string, data: PropertyFormData) => {
      return tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].properties[":propertyId"].$put({
            param: { ...entityParam, propertyId },
            json: data,
          }),
        ),
      );
    },
    deleteFn: async (propertyId: string) => {
      return tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].properties[":propertyId"].$delete({
            param: { ...entityParam, propertyId },
          }),
        ),
      );
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
        return property.type ? (
          <Chip label={property.type} size="small" color="primary" variant="outlined" />
        ) : (
          <EmptyValue />
        );
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
      <Stack spacing={2}>
        {canEdit && <SectionAddButton label="Add Property" onClick={handleCreate} />}

        <RulesetSectionTable
          what="Properties"
          data={properties}
          isLoading={isLoading}
          columns={PROPERTIES_COLUMNS}
          canEdit={canEdit}
          canDelete={canDelete}
          onEdit={handleEditProperty}
          onDelete={handleDelete}
          renderCell={renderCell}
          emptyIcon={ListAltIcon}
          emptyTitle="No properties"
          emptyDescription="No properties defined for this entity."
        />
      </Stack>

      <CreateDialog {...createDialogProps} title="Create New Property" fixedHeight="40vh">
        <Controller
          control={createForm.control}
          name="type"
          render={({ field }) => (
            <PropertyTypeInput
              value={field.value || ""}
              onChange={field.onChange}
              rulesetId={ruleset.id}
              entityType={entityType}
              label="Type"
              placeholder="e.g., tag, category, note"
              fullWidth
            />
          )}
        />
        <Controller
          control={createForm.control}
          name="value"
          rules={requiredRules("Value is required")}
          render={({ field, fieldState }) => (
            <PropertyValueInput
              value={field.value || ""}
              onChange={field.onChange}
              rulesetId={ruleset.id}
              propertyType={createForm.watch("type") || ""}
              label="Value"
              required
              fullWidth
              placeholder="Enter the property value…"
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
            />
          )}
        />
        <DescriptionField
          control={createForm.control}
          name="description"
          placeholder="Enter the property description…"
        />
      </CreateDialog>

      <EditDialog
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        title="Edit Property"
        form={editForm}
        onSubmit={(data) => selectedProperty && updateMutation.mutate({ id: selectedProperty.id, data })}
        isLoading={updateMutation.isPending}
        fixedHeight="60vh"
      >
        <Controller
          control={editForm.control}
          name="type"
          render={({ field }) => (
            <PropertyTypeInput
              value={field.value || ""}
              onChange={field.onChange}
              rulesetId={ruleset.id}
              entityType={entityType}
              label="Type"
              placeholder="e.g., tag, category, note"
              fullWidth
            />
          )}
        />
        <Controller
          control={editForm.control}
          name="value"
          rules={requiredRules("Value is required")}
          render={({ field, fieldState }) => (
            <PropertyValueInput
              value={field.value || ""}
              onChange={field.onChange}
              rulesetId={ruleset.id}
              propertyType={editForm.watch("type") || ""}
              label="Value"
              required
              fullWidth
              placeholder="Enter the property value…"
              error={!!fieldState.error}
              helperText={fieldState.error?.message}
            />
          )}
        />
        <DescriptionField control={editForm.control} name="description" placeholder="Enter the property description…" />
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
