import { Stack, Typography } from "@mui/material";
import { useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";

import {
  AddButton,
  CreateDialog,
  EditDialog,
  ListToolbar,
  SectionContent,
} from "@/client/src/components/common/index.ts";
import {
  EMPTY_MODIFIER,
  type ModifierFormData,
  ModifierFormFields,
  ModifierOperatorCell,
  ModifierTargetCell,
  ModifierValueCell,
} from "@/client/src/components/customization/index.ts";
import { ModifiersIcon } from "@/client/src/components/icons/index.ts";
import { useRulesetPermissions } from "@/client/src/hooks/index.ts";
import { formatDate } from "@/client/src/lib/formatDate.ts";
import { type RulesetDetail } from "@/client/src/lib/queries.ts";
import { EntityDeleteDialog, RulesetSectionTable } from "@/client/src/pages/rulesets/components/index.ts";
import { modifiersQuery } from "@/client/src/pages/rulesets/customization/customizationSectionQueries.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import { followCopiesOf } from "@/client/src/pages/rulesets/followCopies.ts";
import { useOpenEntity, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { buildCustomizationPath, type CustomizableEntityType } from "@/shared/customization/entities.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

type Modifier = ModifiersArray[number];
type ModifiersArray = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["modifiers"]["$get"],
  200
>;

interface ModifiersSectionProps {
  entityId: string;
  entityType: CustomizableEntityType;
  onEntityIdChange?: (copyId: string, sourceId: string) => void;
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
  /** A delete can be undone from Local Changes, its entity's being inherited (`useRestorableDelete`) */
  restorable: boolean;
  ruleset: RulesetDetail;
}

const MODIFIERS_COLUMNS = [
  { key: "target", label: "Target", width: "30%" },
  { key: "operator", label: "Operator", width: "10%" },
  { key: "value", label: "Value", width: "25%" },
  { key: "createdAt", label: "Created", width: "20%" },
];

/** A modifier's values in its form: its edit's, and its duplicate's */
function modifierForm(modifier: Modifier): ModifierFormData {
  return { target: modifier.target, value: modifier.value, operator: modifier.operator };
}

export function ModifiersSection({
  ruleset,
  entityType,
  entityId,
  queryKeysToInvalidate,
  onEntityIdChange,
  restorable,
}: ModifiersSectionProps) {
  const openEntity = useOpenEntity(ruleset.id);

  const { tag, followCopies } = followCopiesOf(entityId, onEntityIdChange);
  const entityParam = { id: ruleset.id, entityType: getUrlSegment(entityType), entityId };

  const {
    data: modifiers,
    isLoading,
    error,
    createForm,
    editForm,
    handleCreate,
    handleDuplicate,
    handleEdit,
    handleDelete,
    createDialogProps,
    editDialogProps,
    deleteDialogProps,
  } = useRulesetSection({
    createDefaults: EMPTY_MODIFIER,
    rulesetId: ruleset.id,
    label: "Modifier",
    query: modifiersQuery(ruleset.id, entityType, entityId),
    queryKeysToInvalidate,
    createFn: async (data: ModifierFormData) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers.$post({
            param: entityParam,
            json: data,
          }),
        ),
      ),
    duplicateFn: async (modifierId: string, data: ModifierFormData) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers[":modifierId"].duplicate.$post({
            param: { ...entityParam, modifierId },
            json: data,
          }),
        ),
      ),
    updateFn: async (modifierId: string, data: ModifierFormData, updatedAt: string | undefined) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers[":modifierId"].$put({
            param: { ...entityParam, modifierId },
            json: { ...data, updatedAt },
          }),
        ),
      ),
    deleteFn: async (modifierId: string) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].modifiers[":modifierId"].$delete({
            param: { ...entityParam, modifierId },
          }),
        ),
      ),
    ...followCopies,
  });

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);

  const queryClient = useQueryClient();

  const handleRowClick = (modifier: Modifier) => {
    openEntity(`${buildCustomizationPath("modifiers", modifier.id)}/requirements`);
  };

  const handleRowMouseEnter = (modifier: Modifier) => {
    void queryClient.prefetchQuery(customizationEntityQuery(ruleset.id, "modifiers", modifier.id));
  };

  const renderCell = (modifier: Modifier, columnKey: string) => {
    switch (columnKey) {
      case "target":
        return <ModifierTargetCell modifier={modifier} />;
      case "value":
        return <ModifierValueCell modifier={modifier} />;
      case "operator":
        return <ModifierOperatorCell modifier={modifier} />;
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
      <Stack spacing={3}>
        {canEdit && <ListToolbar actions={<AddButton label="Add Modifier" onClick={handleCreate} />} />}

        <RulesetSectionTable
          what="Modifiers"
          error={error}
          data={modifiers}
          isLoading={isLoading}
          columns={MODIFIERS_COLUMNS}
          canEdit={canEdit}
          onEdit={(modifier) => handleEdit(modifier, modifierForm(modifier))}
          onDelete={handleDelete}
          restorable={restorable}
          onDuplicate={(modifier) => handleDuplicate(modifier, modifierForm(modifier))}
          onRowClick={handleRowClick}
          onRowMouseEnter={handleRowMouseEnter}
          renderCell={renderCell}
          emptyIcon={ModifiersIcon}
          emptyTitle="No modifiers"
          emptyDescription="No modifiers defined for this entity."
        />
      </Stack>

      <CreateDialog {...createDialogProps} title="Create New Modifier" maxWidth="md">
        <ModifierFormFields form={createForm} rulesetId={ruleset.id} entityType={entityType} mode="create" />
      </CreateDialog>

      <EditDialog {...editDialogProps} title="Edit Modifier" maxWidth="md">
        <ModifierFormFields form={editForm} rulesetId={ruleset.id} entityType={entityType} mode="edit" />
      </EditDialog>

      <EntityDeleteDialog {...deleteDialogProps} what="Modifier" restorable={restorable} />
    </SectionContent>
  );
}
