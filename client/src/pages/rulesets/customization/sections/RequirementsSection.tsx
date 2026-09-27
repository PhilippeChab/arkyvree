import { formatDate } from "@/client/src/lib/activityFormatters.ts";
import type { RulesetDetail } from "@/client/src/lib/queries.ts";
import {
  BlankState,
  CreateDialog,
  DeleteDialog,
  EditDialog,
  DiceSpinner,
  SectionContent,
} from "@/client/src/components/common/index.ts";
import {
  RequirementForm,
  type RequirementFormData,
  type RequirementType,
  TargetPathBreadcrumbs,
} from "@/client/src/components/customization/index.ts";
import { REQUIREMENT_OPERATOR_LABELS } from "@/client/src/lib/operatorLabels.ts";
import { useRulesetPermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import type { EntityType } from "@/client/src/pages/rulesets/customization/types.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import {
  Add as AddIcon,
  ChevronRight as ChevronRightIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  ExpandMore as ExpandMoreIcon,
  Rule as RequirementsIcon,
} from "@mui/icons-material";
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import { TreeItem } from "@mui/x-tree-view/TreeItem";
import type { InferResponseType } from "hono/client";
import { useCallback, useMemo, useState } from "react";
import { SectionAddButton } from "./SectionAddButton.tsx";
import { useCopyFollow } from "./useCopyFollow.ts";

type RequirementsArray = InferResponseType<(typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["requirements"][
    "$get"
  ], 200>;
type Requirement = RequirementsArray[number];

// Tree node interface for hierarchical requirements
interface RequirementTreeNode {
  id: string;
  level: string;
  requirement: Requirement;
  children: RequirementTreeNode[];
}

/** What a requirement saves: its level, then its chaining operator or its condition. */
const requirementPayload = (type: RequirementType, level: string, data: RequirementFormData): RequirementFormData =>
  type === "chaining"
    ? { level, chainingOperator: data.chainingOperator }
    : { level, target: data.target, operator: data.operator, value: data.value };

function PublishedWarning() {
  return (
    <Alert severity="warning">
      This ruleset is published. Changing requirements may break character validation for existing users.
    </Alert>
  );
}

interface RequirementsSectionProps {
  ruleset: RulesetDetail;
  entityType: EntityType;
  entityId: string;
  data?: Requirement[];
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
  onEntityIdChange?: (copyId: string, sourceId: string) => void;
}

export function RequirementsSection(
  { ruleset, entityType, entityId, data: externalData, queryKeysToInvalidate, onEntityIdChange }: RequirementsSectionProps,
) {
  const { tag, followCopies } = useCopyFollow(entityId, onEntityIdChange);
  const entityParam = { id: ruleset.id, entityType, entityId };

  // Parent level for contextual "Add Child" (null = root)
  const [createParentLevel, setCreateParentLevel] = useState<string | null>(null);

  // Requirement type state management
  const [createRequirementType, setCreateRequirementType] = useState<RequirementType>("condition");
  const [editRequirementType, setEditRequirementType] = useState<RequirementType>("condition");

  // Helper function to determine if a requirement is a chaining node
  const isChaining = (requirement: Requirement) => {
    return requirement.chainingOperator &&
      (!requirement.target || !requirement.operator || !requirement.value);
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
    rulesetId: ruleset.id,
    sectionName: `customization-${entityType}-${entityId}-requirements`,
    label: "Requirement",
    data: externalData,
    queryFn: !externalData ? async () => {
      return parseResponse(rpc.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .requirements.$get({
          param: entityParam,
        }));
    } : undefined,
    queryKeysToInvalidate,
    createFn: async (data: RequirementFormData) => {
      return tag(parseResponse(rpc.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .requirements.$post({
          param: entityParam,
          json: data,
        })));
    },
    updateFn: async (requirementId: string, data: RequirementFormData) => {
      return tag(parseResponse(rpc.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .requirements[":requirement_id"].$put({
          param: { ...entityParam, requirement_id: requirementId },
          json: data,
        })));
    },
    deleteFn: async (requirementId: string) => {
      return tag(parseResponse(rpc.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .requirements[":requirement_id"].$delete({
          param: { ...entityParam, requirement_id: requirementId },
        })));
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

  const computeNextLevel = useCallback((parentLevel: string | null): string => {
    if (!requirements) return "1";

    if (parentLevel === null) {
      const rootNumbers = requirements
        .map((r) => parseInt(r.level.split(".")[0]))
        .filter((n) => !isNaN(n));
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
  }, [requirements]);

  // Build tree structure from flat requirements array
  const requirementsTree = useMemo(() => {
    if (!requirements) return [];

    // Sort requirements by level to ensure proper hierarchy
    const sortedRequirements = [...requirements].sort((a, b) => {
      const aLevel = parseFloat(a.level);
      const bLevel = parseFloat(b.level);
      return aLevel - bLevel;
    });

    const treeNodes: RequirementTreeNode[] = [];
    const nodeMap = new Map<string, RequirementTreeNode>();

    // Create nodes for all requirements
    for (const requirement of sortedRequirements) {
      const node: RequirementTreeNode = {
        id: requirement.id,
        level: requirement.level,
        requirement,
        children: [],
      };
      nodeMap.set(requirement.level, node);
    }

    // Build hierarchy based on level numbering
    for (const requirement of sortedRequirements) {
      const node = nodeMap.get(requirement.level);
      if (!node) continue;
      const levelParts = requirement.level.split(".");

      // Determine if this is a root node
      // Root nodes: "1", "2", "1.0", "2.0" etc (major version changes)
      const isRootNode = levelParts.length === 1 ||
        (levelParts.length === 2 && levelParts[1] === "0");

      if (isRootNode) {
        // Root level (e.g., "1", "2", "1.0", "2.0")
        treeNodes.push(node);
      } else {
        // Child level - find the immediate parent
        // For "1.2.1", parent is "1.2"
        // For "1.2", parent is "1" (or "1.0")
        const parentLevel = levelParts.slice(0, -1).join(".");
        let parentNode = nodeMap.get(parentLevel);

        // If parent not found and we're looking for something like "1", try "1.0"
        if (!parentNode && levelParts.length === 2) {
          parentNode = nodeMap.get(`${levelParts[0]}.0`);
        }

        if (parentNode) {
          parentNode.children.push(node);
        } else {
          // If parent doesn't exist, treat as root
          treeNodes.push(node);
        }
      }
    }

    return treeNodes;
  }, [requirements]);

  // Get all parent node IDs for default expansion
  const defaultExpandedItems = useMemo(() => {
    const expandedIds: string[] = [];

    const collectParentIds = (nodes: RequirementTreeNode[]) => {
      for (const node of nodes) {
        if (node.children.length > 0) {
          expandedIds.push(node.id);
          collectParentIds(node.children);
        }
      }
    };

    collectParentIds(requirementsTree);
    return expandedIds;
  }, [requirementsTree]);

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
    if (requirementIsChaining) {
      handleEditChaining(requirement);
    } else {
      handleEditCondition(requirement);
    }
  };

  // Render a single tree node
  const renderRequirementNode = (node: RequirementTreeNode): React.ReactNode => {
    const requirement = node.requirement;
    const requirementIsChaining = isChaining(requirement);

    return (
      <TreeItem
        key={node.id}
        itemId={node.id}
        label={
          <Card
            variant="outlined"
            sx={{
              my: 0.5,
              mx: 0,
              ml: node.level.split(".").length > 1 ? { xs: 0, sm: 1 } : 0, // Indent children
              borderLeft: node.level.split(".").length > 1 ? "3px solid" : "none", // Visual hierarchy
              borderColor: "primary.main",
            }}
          >
            <CardContent sx={{ py: 1.5, px: 2, "&:last-child": { pb: 1.5 } }}>
              <Box sx={{ display: "flex", flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
                <Chip
                  label={requirement.level}
                  size="small"
                  color="default"
                  variant="filled"
                  sx={{ fontWeight: 700, minWidth: 32, fontFamily: "monospace" }}
                />

                {requirementIsChaining
                  ? (
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <Typography variant="body2" sx={{ color: "text.secondary" }}>
                        Chaining:
                      </Typography>
                      <Chip
                        label={requirement.chainingOperator}
                        size="small"
                        color="warning"
                        variant="outlined"
                      />
                    </Stack>
                  )
                  : (
                    <>
                      {requirement.target
                        ? <TargetPathBreadcrumbs target={requirement.target} targetLabels={requirement.targetLabels} />
                        : <Typography variant="body2" sx={{ fontWeight: 500 }}>—</Typography>}
                      {requirement.operator && (
                        <Chip
                          label={REQUIREMENT_OPERATOR_LABELS[requirement.operator] || requirement.operator}
                          size="small"
                          color="secondary"
                          variant="outlined"
                        />
                      )}
                      <Typography variant="body2">
                        {requirement.valueLabel || requirement.value || "—"}
                      </Typography>
                    </>
                  )}

                <Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
                  <Typography
                    variant="caption"
                    sx={{
                      color: "text.secondary",
                      whiteSpace: "nowrap",
                      display: { xs: "none", sm: "block" }
                    }}>
                    {formatDate(requirement.createdAt)}
                  </Typography>

                  {canEdit && requirementIsChaining && (
                    <IconButton
                      size="small"
                      color="primary"
                      title="Add child requirement"
                      onClick={(e) => {
                        e.stopPropagation();
                        openCreate(node.level);
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
                </Box>
              </Box>
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
      {canEdit && <SectionAddButton label="Add Requirement" onClick={() => openCreate(null)} />}
      {/* Loading State */}
      {isLoading && (
        <DiceSpinner sx={{ py: 4 }} />
      )}
      {/* Content */}
      {!isLoading && (
        <>
          {requirementsTree.length === 0
            ? (
              <BlankState
                icon={RequirementsIcon}
                title="No requirements"
                description="No requirements defined for this entity."
              />
            )
            : (
              <SimpleTreeView
                slots={{
                  collapseIcon: ExpandMoreIcon,
                  expandIcon: ChevronRightIcon,
                }}
                sx={{ flexGrow: 1, maxWidth: "100%", overflowY: "auto" }}
                defaultExpandedItems={defaultExpandedItems}
              >
                {requirementsTree.map(renderRequirementNode)}
              </SimpleTreeView>
            )}
        </>
      )}
      <CreateDialog
        open={createDialogOpen}
        onClose={() => {
          setCreateDialogOpen(false);
          resetCreateState();
        }}
        title="Create Requirement"
        form={createForm}
        onSubmit={(data) => createMutation.mutate(requirementPayload(createRequirementType, computeNextLevel(createParentLevel), data))}
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
