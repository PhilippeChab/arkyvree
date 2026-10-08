import { Alert, Card, CardContent, Stack, Typography } from "@mui/material";
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import { TreeItem } from "@mui/x-tree-view/TreeItem";
import { type InferResponseType, parseResponse } from "hono/client";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import {
  AddButton,
  BlankState,
  CreateDialog,
  DiceSpinner,
  EditDialog,
  EmptyValue,
  ExpandArrow,
  ListToolbar,
  LoadError,
  ROW_ACTIONS_HOVER_SX,
  RowAction,
  RowActions,
  SectionContent,
  ValueChip,
} from "@/client/src/components/common/index.ts";
import {
  EMPTY_REQUIREMENT,
  RequirementForm,
  type RequirementFormData,
  type RequirementType,
  TargetPathBreadcrumbs,
} from "@/client/src/components/customization/index.ts";
import { AddIcon, DeleteIcon, EditIcon, RequirementsIcon } from "@/client/src/components/icons/index.ts";
import { formatDate } from "@/client/src/lib/formatDate.ts";
import type { RulesetDetail } from "@/client/src/lib/queries.ts";
import { EntityDeleteDialog } from "@/client/src/pages/rulesets/components/index.ts";
import { requirementsQuery } from "@/client/src/pages/rulesets/customization/customizationSectionQueries.ts";
import { useRulesetPermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import type { CustomizationOwnerType } from "@/shared/customization/entities.ts";
import { formatOperator } from "@/shared/customization/operators.ts";
import RequirementTree, { type RequirementNode } from "@/shared/customization/RequirementTree.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import { useCopyFollow } from "./useCopyFollow.ts";

type Requirement = RequirementsArray[number];
type RequirementsArray = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["requirements"]["$get"],
  200
>;

interface RequirementsSectionProps {
  data?: Requirement[];
  entityId: string;
  entityType: CustomizationOwnerType;
  onEntityIdChange?: (copyId: string, sourceId: string) => void;
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
  /** A delete can be undone from Local Changes, its entity's being inherited (`useRestorableDelete`) */
  restorable: boolean;
  ruleset: RulesetDetail;
}

/** A requirement in the tree the section shows, with the requirements it groups. */
type RequirementTreeNode = RequirementNode<Requirement>;

function PublishedWarning() {
  return (
    <Alert severity="warning">
      This ruleset is published. Changing requirements may break character validation for existing users.
    </Alert>
  );
}

/** What a requirement saves: its level, then its chaining operator or its condition. */
function requirementPayload(type: RequirementType, level: string, data: RequirementFormData): RequirementFormData {
  return type === "chaining"
    ? { level, chainingOperator: data.chainingOperator }
    : { level, target: data.target, operator: data.operator, value: data.value };
}

export function RequirementsSection({
  ruleset,
  entityType,
  entityId,
  data: externalData,
  queryKeysToInvalidate,
  onEntityIdChange,
  restorable,
}: RequirementsSectionProps) {
  const { tag, followCopies } = useCopyFollow(entityId, onEntityIdChange);
  const entityParam = { id: ruleset.id, entityType: getUrlSegment(entityType), entityId };

  // Parent level for contextual "Add Child" (null = root)
  const [createParentLevel, setCreateParentLevel] = useState<string | null>(null);

  const [createRequirementType, setCreateRequirementType] = useState<RequirementType>("condition");
  const [editRequirementType, setEditRequirementType] = useState<RequirementType>("condition");

  // Helper function to determine if a requirement is a chaining node
  const isChaining = (requirement: Requirement) =>
    requirement.chainingOperator && (!requirement.target || !requirement.operator || !requirement.value);

  const {
    data: requirements,
    isLoading,
    error,
    editDialog,
    createForm,
    editForm,
    createMutation,
    updateMutation,
    handleCreate,
    handleEdit,
    handleDelete,
    createDialogProps,
    editDialogProps,
    deleteDialogProps,
  } = useRulesetSection({
    createDefaults: EMPTY_REQUIREMENT,
    rulesetId: ruleset.id,
    label: "Requirement",
    data: externalData,
    query: requirementsQuery(ruleset.id, entityType, entityId),
    queryKeysToInvalidate,
    createFn: async (data: RequirementFormData) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements.$post({
            param: entityParam,
            json: data,
          }),
        ),
      ),
    updateFn: async (requirementId: string, data: RequirementFormData, updatedAt: string | undefined) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements[":requirementId"].$put({
            param: { ...entityParam, requirementId },
            json: { ...data, updatedAt },
          }),
        ),
      ),
    deleteFn: async (requirementId: string) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements[":requirementId"].$delete({
            param: { ...entityParam, requirementId },
          }),
        ),
      ),
    ...followCopies,
  });

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  const canDelete = canEdit;
  const isPublished = ruleset.status === "Published";

  /**
   * Opens the create dialog for a root requirement (null) or a child of the given level, empty: its type, its parent and
   * its form are set as it opens, never as it closes, so its content holds while it fades out.
   */
  const openCreate = (parentLevel: string | null) => {
    setCreateParentLevel(parentLevel);
    setCreateRequirementType("condition");
    handleCreate();
  };

  const computeNextLevel = useCallback(
    (parentLevel: string | null): string => {
      if (!requirements) return "1";

      if (parentLevel === null) {
        const rootNumbers = requirements.map((r) => parseInt(r.level.split(".")[0])).filter((n) => !isNaN(n));
        return String((rootNumbers.length > 0 ? Math.max(...rootNumbers) : 0) + 1);
      }

      const prefix = parentLevel + ".";
      const childNumbers = requirements
        .filter((r) => r.level.startsWith(prefix))
        .map((r) => {
          const rest = r.level.slice(prefix.length);
          if (rest.includes(".")) return NaN;
          return parseInt(rest);
        })
        .filter((n) => !isNaN(n));
      return `${parentLevel}.${(childNumbers.length > 0 ? Math.max(...childNumbers) : 0) + 1}`;
    },
    [requirements],
  );

  // The requirements' tree, and after it a requirement under a condition (which groups nothing), so it can be fixed
  const loadFailed = !!error && !requirements;
  const requirementsTree = useMemo((): RequirementTreeNode[] => {
    if (!requirements) return [];
    const tree = RequirementTree.fromRows(requirements);
    return [...tree.roots, ...tree.detached.map((requirement) => ({ requirement, children: [] }))];
  }, [requirements]);

  const parentIds = useMemo(() => {
    const expandedIds: string[] = [];

    const collectParentIds = (nodes: RequirementTreeNode[]) => {
      for (const node of nodes) {
        if (node.children.length > 0) {
          expandedIds.push(node.requirement.id);
          collectParentIds(node.children);
        }
      }
    };

    collectParentIds(requirementsTree);
    return expandedIds;
  }, [requirementsTree]);

  // Parents are expanded, new ones included, except those the user collapsed.
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<string>>(new Set());
  const expandedItems = useMemo(() => parentIds.filter((id) => !collapsedIds.has(id)), [parentIds, collapsedIds]);

  const handleEditChaining = (requirement: Requirement) => {
    setEditRequirementType("chaining");
    // Unregister fields that won't be used
    editForm.unregister("target");
    editForm.unregister("operator");
    editForm.unregister("value");
    handleEdit(requirement, {
      level: requirement.level,
      chainingOperator: requirement.chainingOperator || "",
      target: undefined,
      value: undefined,
      operator: undefined,
    });
  };

  const handleEditCondition = (requirement: Requirement) => {
    setEditRequirementType("condition");
    // Unregister fields that won't be used
    editForm.unregister("chainingOperator");
    handleEdit(requirement, {
      level: requirement.level,
      target: requirement.target || "",
      value: requirement.value || "",
      operator: requirement.operator || "",
      chainingOperator: undefined,
    });
  };

  const handleEditRequirement = (requirement: Requirement) => {
    const requirementIsChaining = isChaining(requirement);
    if (requirementIsChaining) handleEditChaining(requirement);
    else handleEditCondition(requirement);
  };

  const renderRequirementNode = (node: RequirementTreeNode): ReactNode => {
    const requirement = node.requirement;
    const requirementIsChaining = isChaining(requirement);

    return (
      <TreeItem
        key={node.requirement.id}
        itemId={node.requirement.id}
        sx={{
          // Its own row, not its children's: the row's room around its card, and a child's indent
          "& > .MuiTreeItem-content": { py: 1 },
          "& > .MuiTreeItem-content > .MuiTreeItem-label": {
            pl: node.requirement.level.split(".").length > 1 ? { xs: 0, sm: 1 } : 0,
          },
        }}
        label={
          <Card
            variant="outlined"
            sx={{
              borderLeft: node.requirement.level.split(".").length > 1 ? 3 : "none", // Visual hierarchy
              borderColor: "primary.main",
              ...ROW_ACTIONS_HOVER_SX,
            }}
          >
            <CardContent sx={{ py: 1.5, px: 2, "&:last-child": { pb: 1.5 } }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <ValueChip label={requirement.level} color="default" />

                {requirementIsChaining ? (
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      Chaining:
                    </Typography>
                    <ValueChip label={requirement.chainingOperator} color="warning" />
                  </Stack>
                ) : (
                  <>
                    {requirement.target ? (
                      <TargetPathBreadcrumbs target={requirement.target} targetLabels={requirement.targetLabels} />
                    ) : (
                      <EmptyValue />
                    )}
                    {requirement.operator && (
                      <ValueChip label={formatOperator("requirement", requirement.operator)} color="secondary" />
                    )}
                    <Typography variant="body2">
                      {requirement.valueLabel || requirement.value || <EmptyValue />}
                    </Typography>
                  </>
                )}

                <Stack direction="row" spacing={0.5} sx={{ ml: "auto", alignItems: "center", flexShrink: 0 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      whiteSpace: "nowrap",
                      display: { xs: "none", sm: "block" },
                    }}
                  >
                    {formatDate(requirement.createdAt)}
                  </Typography>

                  {/* The tree item toggles on a click: an action's click stops at its button */}
                  <RowActions>
                    {canEdit && requirementIsChaining && (
                      <RowAction
                        icon={AddIcon}
                        label="Add Child Requirement"
                        onClick={(e) => {
                          e.stopPropagation();
                          openCreate(node.requirement.level);
                        }}
                      />
                    )}
                    {canEdit && (
                      <RowAction
                        icon={EditIcon}
                        label="Edit Requirement"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditRequirement(requirement);
                        }}
                      />
                    )}
                    {canDelete && (
                      <RowAction
                        icon={DeleteIcon}
                        label="Delete Requirement"
                        intent="destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(requirement.id);
                        }}
                      />
                    )}
                  </RowActions>
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        }
      >
        {node.children.length > 0 && node.children.map(renderRequirementNode)}
      </TreeItem>
    );
  };

  return (
    <SectionContent>
      <Stack spacing={3}>
        {canEdit && <ListToolbar actions={<AddButton label="Add Requirement" onClick={() => openCreate(null)} />} />}
        {/* Loading State */}
        {isLoading && <DiceSpinner sx={{ py: 4 }} />}
        {/* Error State: only while nothing has loaded, a failed refetch keeping the tree */}
        {loadFailed && <LoadError what="Requirements" error={error} />}
        {/* Content */}
        {!isLoading &&
          !loadFailed &&
          (requirementsTree.length === 0 ? (
            <BlankState
              icon={RequirementsIcon}
              title="No requirements"
              description="No requirements defined for this entity."
            />
          ) : (
            <SimpleTreeView
              slots={{
                collapseIcon: () => <ExpandArrow open />,
                expandIcon: () => <ExpandArrow open={false} />,
              }}
              sx={{ flexGrow: 1, maxWidth: "100%", overflowY: "auto" }}
              expandedItems={expandedItems}
              onExpandedItemsChange={(_, ids) => setCollapsedIds(new Set(parentIds.filter((id) => !ids.includes(id))))}
            >
              {requirementsTree.map(renderRequirementNode)}
            </SimpleTreeView>
          ))}
      </Stack>
      <CreateDialog
        {...createDialogProps}
        title="Create Requirement"
        onSubmit={(data) =>
          createMutation.mutate({
            data: requirementPayload(createRequirementType, computeNextLevel(createParentLevel), data),
          })
        }
        maxWidth="md"
      >
        {isPublished && <PublishedWarning />}
        <RequirementForm
          form={createForm}
          type={createRequirementType}
          onTypeChange={setCreateRequirementType}
          rulesetId={ruleset.id}
          mode="create"
        />
      </CreateDialog>
      <EditDialog
        {...editDialogProps}
        title="Edit Requirement"
        onSubmit={(data) => {
          if (!editDialog.target) return;
          updateMutation.mutate({
            id: editDialog.target.id,
            data: requirementPayload(editRequirementType, editDialog.target.level, data),
            updatedAt: editDialog.target.updatedAt,
          });
        }}
        maxWidth="md"
      >
        {isPublished && <PublishedWarning />}
        <RequirementForm
          form={editForm}
          type={editRequirementType}
          onTypeChange={setEditRequirementType}
          rulesetId={ruleset.id}
          mode="edit"
        />
      </EditDialog>
      <EntityDeleteDialog {...deleteDialogProps} what="Requirement" restorable={restorable} />
    </SectionContent>
  );
}
