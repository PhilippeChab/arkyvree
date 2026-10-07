import { Alert, Card, CardContent, Chip, IconButton, Stack, Typography } from "@mui/material";
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import { TreeItem } from "@mui/x-tree-view/TreeItem";
import { type InferResponseType, parseResponse } from "hono/client";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import {
  BlankState,
  CreateDialog,
  DeleteDialog,
  DiceSpinner,
  EditDialog,
  SectionContent,
} from "@/client/src/components/common/index.ts";
import {
  EMPTY_REQUIREMENT,
  RequirementForm,
  type RequirementFormData,
  type RequirementType,
  TargetPathBreadcrumbs,
} from "@/client/src/components/customization/index.ts";
import {
  AddIcon,
  ChevronRightIcon,
  DeleteIcon,
  EditIcon,
  ExpandMoreIcon,
  RequirementsIcon,
} from "@/client/src/components/icons/index.ts";
import { formatDate } from "@/client/src/lib/formatDate.ts";
import { REQUIREMENT_OPERATOR_LABELS } from "@/client/src/lib/operatorLabels.ts";
import type { RulesetDetail } from "@/client/src/lib/queries.ts";
import {
  customizationSection,
  requirementsQuery,
} from "@/client/src/pages/rulesets/customization/customizationQueries.ts";
import { useRulesetPermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import type { CustomizationOwnerType } from "@/shared/customization/entities.ts";
import RequirementTree, { type RequirementNode } from "@/shared/customization/RequirementTree.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import { SectionAddButton } from "./SectionAddButton.tsx";
import { useCopyFollow } from "./useCopyFollow.ts";

type Requirement = RequirementsArray[number];
type RequirementsArray = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["requirements"]["$get"],
  200
>;

interface RequirementsSectionProps {
  ruleset: RulesetDetail;
  entityType: CustomizationOwnerType;
  entityId: string;
  data?: Requirement[];
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
  onEntityIdChange?: (copyId: string, sourceId: string) => void;
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
}: RequirementsSectionProps) {
  const { tag, followCopies } = useCopyFollow(entityId, onEntityIdChange);
  const entityParam = { id: ruleset.id, entityType: getUrlSegment(entityType), entityId };

  // Parent level for contextual "Add Child" (null = root)
  const [createParentLevel, setCreateParentLevel] = useState<string | null>(null);

  const [createRequirementType, setCreateRequirementType] = useState<RequirementType>("condition");
  const [editRequirementType, setEditRequirementType] = useState<RequirementType>("condition");

  // Helper function to determine if a requirement is a chaining node
  const isChaining = (requirement: Requirement) => {
    return requirement.chainingOperator && (!requirement.target || !requirement.operator || !requirement.value);
  };

  const {
    data: requirements,
    isLoading,
    createDialogOpen,
    editDialogOpen,
    deleteDialogOpen,
    setCreateDialogOpen,
    setEditDialogOpen,
    setDeleteDialogOpen,
    selectedItem: selectedRequirement,
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
    createDefaults: EMPTY_REQUIREMENT,
    rulesetId: ruleset.id,
    sectionName: customizationSection(entityType, entityId, "requirements"),
    label: "Requirement",
    data: externalData,
    query: requirementsQuery(ruleset.id, entityType, entityId),
    queryKeysToInvalidate,
    createFn: async (data: RequirementFormData) => {
      return tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements.$post({
            param: entityParam,
            json: data,
          }),
        ),
      );
    },
    updateFn: async (requirementId: string, data: RequirementFormData) => {
      return tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements[":requirementId"].$put({
            param: { ...entityParam, requirementId },
            json: data,
          }),
        ),
      );
    },
    deleteFn: async (requirementId: string) => {
      return tag(
        parseResponse(
          rpc.api.rulesets[":id"].customization[":entityType"][":entityId"].requirements[":requirementId"].$delete({
            param: { ...entityParam, requirementId },
          }),
        ),
      );
    },
    ...followCopies,
  });

  const { canEditEntities: canEdit } = useRulesetPermissions(ruleset);
  const canDelete = canEdit;
  const isPublished = ruleset.status === "Published";

  /** Opens the create dialog for a root requirement (null) or a child of the given level. */
  const openCreate = (parentLevel: string | null) => {
    setCreateParentLevel(parentLevel);
    setCreateRequirementType("condition");
    handleCreate();
  };

  // Reset per-dialog state so reopening a dialog doesn't inherit the previous session's.
  const resetCreateState = () => {
    setCreateRequirementType("condition");
    setCreateParentLevel(null);
    createForm.reset();
  };
  const resetEditState = () => {
    setEditRequirementType("condition");
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
            }}
          >
            <CardContent sx={{ py: 1.5, px: 2, "&:last-child": { pb: 1.5 } }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                <Chip
                  label={requirement.level}
                  size="small"
                  color="default"
                  variant="filled"
                  sx={{ fontWeight: 700, minWidth: 32, fontFamily: "monospace" }}
                />

                {requirementIsChaining ? (
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      Chaining:
                    </Typography>
                    <Chip label={requirement.chainingOperator} size="small" color="warning" variant="outlined" />
                  </Stack>
                ) : (
                  <>
                    {requirement.target ? (
                      <TargetPathBreadcrumbs target={requirement.target} targetLabels={requirement.targetLabels} />
                    ) : (
                      <Typography variant="body2" sx={{ fontWeight: 500 }}>
                        —
                      </Typography>
                    )}
                    {requirement.operator && (
                      <Chip
                        label={REQUIREMENT_OPERATOR_LABELS[requirement.operator] || requirement.operator}
                        size="small"
                        color="secondary"
                        variant="outlined"
                      />
                    )}
                    <Typography variant="body2">{requirement.valueLabel || requirement.value || "—"}</Typography>
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

                  {canEdit && requirementIsChaining && (
                    <IconButton
                      size="small"
                      color="primary"
                      title="Add child requirement"
                      aria-label="Add child requirement"
                      onClick={(e) => {
                        e.stopPropagation();
                        openCreate(node.requirement.level);
                      }}
                    >
                      <AddIcon fontSize="small" />
                    </IconButton>
                  )}
                  {canEdit && (
                    <IconButton
                      size="small"
                      aria-label="Edit requirement"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditRequirement(requirement);
                      }}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                  )}
                  {canDelete && (
                    <IconButton
                      size="small"
                      color="error"
                      aria-label="Delete requirement"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(requirement.id);
                      }}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  )}
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
      <Stack spacing={2}>
        {canEdit && <SectionAddButton label="Add Requirement" onClick={() => openCreate(null)} />}
        {/* Loading State */}
        {isLoading && <DiceSpinner sx={{ py: 4 }} />}
        {/* Content */}
        {!isLoading &&
          (requirementsTree.length === 0 ? (
            <BlankState
              icon={RequirementsIcon}
              title="No requirements"
              description="No requirements defined for this entity."
            />
          ) : (
            <SimpleTreeView
              slots={{
                collapseIcon: ExpandMoreIcon,
                expandIcon: ChevronRightIcon,
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
        open={createDialogOpen}
        onClose={() => {
          setCreateDialogOpen(false);
          resetCreateState();
        }}
        title="Create Requirement"
        form={createForm}
        onSubmit={(data) =>
          createMutation.mutate(requirementPayload(createRequirementType, computeNextLevel(createParentLevel), data))
        }
        isLoading={createMutation.isPending}
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
        open={editDialogOpen}
        onClose={() => {
          setEditDialogOpen(false);
          resetEditState();
        }}
        title="Edit Requirement"
        form={editForm}
        onSubmit={(data) => {
          if (!selectedRequirement) return;
          updateMutation.mutate({
            id: selectedRequirement.id,
            data: requirementPayload(editRequirementType, selectedRequirement.level, data),
          });
        }}
        isLoading={updateMutation.isPending}
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
      <DeleteDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title="Delete Requirement"
        message="Are you sure you want to delete this requirement? This action cannot be undone."
        onConfirm={confirmDelete}
        isLoading={deleteMutation.isPending}
      />
    </SectionContent>
  );
}
