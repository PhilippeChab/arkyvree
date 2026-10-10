import { Stack, Typography } from "@mui/material";
import { type InferResponseType, parseResponse } from "hono/client";

import {
  AddButton,
  CreateDialog,
  EditDialog,
  EmptyValue,
  ListToolbar,
  SectionContent,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import {
  EMPTY_PROPERTY,
  type PropertyFormData,
  PropertyFormFields,
} from "@/client/src/components/customization/index.ts";
import { PropertiesIcon } from "@/client/src/components/icons/index.ts";
import { useRulesetPermissions } from "@/client/src/hooks/index.ts";
import { type RulesetDetail } from "@/client/src/lib/queries.ts";
import {
  DescriptionCell,
  EntityDeleteDialog,
  RulesetSectionTable,
} from "@/client/src/pages/rulesets/components/index.ts";
import { propertiesQuery } from "@/client/src/pages/rulesets/customization/customizationSectionQueries.ts";
import { followCopiesOf } from "@/client/src/pages/rulesets/followCopies.ts";
import { useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import type { CustomizableEntityType } from "@/shared/customization/entities.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

interface PropertiesSectionProps {
  data?: Property[];
  entityId: string;
  entityType: CustomizableEntityType;
  onEntityIdChange?: (copyId: string, sourceId: string) => void;
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
  /** A delete can be undone from Local Changes, its entity's being inherited (`useRestorableDelete`) */
  restorable: boolean;
  ruleset: RulesetDetail;
}
type PropertiesArray = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["properties"]["$get"],
  200
>;

type Property = PropertiesArray[number];

const PROPERTIES_COLUMNS = [
  { key: "type", label: "Type", width: "20%" },
  { key: "value", label: "Value", width: "40%" },
  { key: "description", label: "Description", width: "40%" },
];

/** Its create and edit dialogs' height: room for a completion list under the type and the value. */
const PROPERTY_DIALOG_HEIGHT = "60vh";

export function PropertiesSection({
  ruleset,
  entityType,
  entityId,
  data: externalData,
  queryKeysToInvalidate,
  onEntityIdChange,
  restorable,
}: PropertiesSectionProps) {
  const { tag, followCopies } = followCopiesOf(entityId, onEntityIdChange);
  const entityParam = { id: ruleset.id, entityType: getUrlSegment(entityType), entityId };

  const {
    data: properties,
    isLoading,
    error,
    createForm,
    editForm,
    handleCreate,
    handleEdit,
    handleDelete,
    createDialogProps,
    editDialogProps,
    deleteDialogProps,
  } = useRulesetSection({
    createDefaults: EMPTY_PROPERTY,
    rulesetId: ruleset.id,
    label: "Property",
    data: externalData,
    query: propertiesQuery(ruleset.id, entityType, entityId),
    queryKeysToInvalidate,
    createFn: async (data: PropertyFormData) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].properties.$post({
            param: entityParam,
            json: data,
          }),
        ),
      ),
    updateFn: async (propertyId: string, data: PropertyFormData, updatedAt: string | undefined) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].properties[":propertyId"].$put({
            param: { ...entityParam, propertyId },
            json: { ...data, updatedAt },
          }),
        ),
      ),
    deleteFn: async (propertyId: string) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].properties[":propertyId"].$delete({
            param: { ...entityParam, propertyId },
          }),
        ),
      ),
    ...followCopies,
  });

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  const handleEditProperty = (property: Property) => {
    handleEdit(property, {
      value: property.value,
      type: property.type ?? "",
      description: property.description ?? "",
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
        return property.type ? <ValueChip label={property.type} /> : <EmptyValue />;
      case "description":
        return <DescriptionCell text={property.description} />;
      default:
        return null;
    }
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        {canEdit && <ListToolbar actions={<AddButton label="Add Property" onClick={handleCreate} />} />}

        <RulesetSectionTable
          what="Properties"
          error={error}
          data={properties}
          isLoading={isLoading}
          columns={PROPERTIES_COLUMNS}
          canEdit={canEdit}
          onEdit={handleEditProperty}
          onDelete={handleDelete}
          restorable={restorable}
          renderCell={renderCell}
          emptyIcon={PropertiesIcon}
          emptyTitle="No properties"
          emptyDescription="No properties defined for this entity."
        />
      </Stack>

      <CreateDialog {...createDialogProps} title="Create New Property" fixedHeight={PROPERTY_DIALOG_HEIGHT}>
        <PropertyFormFields form={createForm} rulesetId={ruleset.id} entityType={entityType} />
      </CreateDialog>

      <EditDialog {...editDialogProps} title="Edit Property" fixedHeight={PROPERTY_DIALOG_HEIGHT}>
        <PropertyFormFields form={editForm} rulesetId={ruleset.id} entityType={entityType} />
      </EditDialog>

      <EntityDeleteDialog {...deleteDialogProps} what="Property" restorable={restorable} />
    </SectionContent>
  );
}
