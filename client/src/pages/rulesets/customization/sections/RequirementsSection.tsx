import {
  BlankState,
  CreateDialog,
  DeleteDialog,
  EditDialog,
  DiceSpinner,
} from "@/client/src/components/common/index.ts";
import {
  PathValueInput,
  RequirementOperationSelect,
  TargetPathBreadcrumbs,
  TargetPathInput,
  defaultValueForPath,
} from "@/client/src/components/customization/index.ts";
import { REQUIREMENT_OPERATOR_LABELS } from "@/client/src/lib/operatorLabels.ts";
import { usePermissions, useRulesetSection } from "@/client/src/pages/rulesets/hooks/index.ts";
import { extractTemplateExpression, isTemplateValue } from "@/client/src/lib/templateValues.ts";
import { TemplateExpressionInput, type TemplateExpressionInputRef } from "@/client/src/components/customization/TemplateExpressionInput.tsx";
import { TemplateExpressionToolbar } from "@/client/src/components/customization/TemplateExpressionToolbar.tsx";
import type { EntityType } from "@/client/src/pages/rulesets/customization/types.ts";
import { rpc } from "@/client/src/services/rpc.ts";
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
  Button,
  Card,
  CardContent,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  FormControlLabel,
  Stack,
  Switch,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import { TreeItem } from "@mui/x-tree-view/TreeItem";
import type { InferRequestType, InferResponseType } from "hono/client";
import { useCallback, useMemo, useRef, useState } from "react";

type RequirementsResponse = InferResponseType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["requirements"][
    "$get"
  ]
>;
type RequirementsArray = Exclude<RequirementsResponse, { error: string }>;
type Requirement = RequirementsArray[number];

type RequirementFormData = InferRequestType<
  (typeof rpc.api.rulesets)[":id"]["customization"][":entityType"][":entityId"]["requirements"][
    "$post"
  ]
>["json"];

// Tree node interface for hierarchical requirements
interface RequirementTreeNode {
  id: string;
  level: string;
  requirement: Requirement;
  children: RequirementTreeNode[];
}

interface RequirementPath {
  path: string;
  category: string;
  description: string;
  valueType: "number" | "string" | "boolean";
  operators: string[];
  possibleValues?: { value: string; label: string }[];
}

interface RequirementsSectionProps {
  ruleset: {
    id: string;
    name: string;
    userId?: string | null;
    status?: string;
  };
  entityType: EntityType;
  entityId: string;
  data?: Requirement[];
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
  onEntityIdChange?: (newEntityId: string) => void;
}

export function RequirementsSection(
  { ruleset, entityType, entityId, data: externalData, queryKeysToInvalidate, onEntityIdChange }: RequirementsSectionProps,
) {
  const handleResolvedEntityId = useMemo(() => (data: unknown) => {
    const resolved = (data as { resolvedEntityId?: string }).resolvedEntityId;
    if (resolved && resolved !== entityId) {
      onEntityIdChange?.(resolved);
    }
  }, [entityId, onEntityIdChange]);

  // Path state management for operator selection
  const [selectedCreatePath, setSelectedCreatePath] = useState<RequirementPath | null>(null);
  const [selectedEditPath, setSelectedEditPath] = useState<RequirementPath | null>(null);
  const [createTemplateMode, setCreateTemplateMode] = useState(false);
  const [createTemplateExpression, setCreateTemplateExpression] = useState("");
  const [editTemplateMode, setEditTemplateMode] = useState(false);
  const [editTemplateExpression, setEditTemplateExpression] = useState("");
  const [editLiteralValue, setEditLiteralValue] = useState("");
  const createExpressionRef = useRef<TemplateExpressionInputRef | null>(null);
  const editExpressionRef = useRef<TemplateExpressionInputRef | null>(null);

  // Toggling template off while the literal is empty silently saves "" and
  // wipes the prior value. Carry the rendered template across as the new
  // literal so the user can either edit it, delete it deliberately, or save
  // as a template-shaped string — but never lose content accidentally.
  const handleToggleCreateTemplate = (checked: boolean) => {
    setCreateTemplateMode(checked);
    if (!checked) {
      const currentLiteral = (createForm.getValues("value") ?? "").toString();
      if (!currentLiteral.trim() && createTemplateExpression.trim()) {
        createForm.setValue("value", `{{ ${createTemplateExpression} }}`);
      }
    }
  };
  const handleToggleEditTemplate = (checked: boolean) => {
    setEditTemplateMode(checked);
    if (!checked && !editLiteralValue.trim() && editTemplateExpression.trim()) {
      setEditLiteralValue(`{{ ${editTemplateExpression} }}`);
    }
  };

  // Reset all per-dialog state so reopening the dialog doesn't inherit
  // the toggle/expression/literal from the previous session.
  const resetCreateState = () => {
    setSelectedCreatePath(null);
    setCreateRequirementType("condition");
    setCreateParentLevel(null);
    setCreateTemplateMode(false);
    setCreateTemplateExpression("");
    createForm.reset();
  };
  const resetEditState = () => {
    setSelectedEditPath(null);
    setEditRequirementType("condition");
    setEditTemplateMode(false);
    setEditTemplateExpression("");
    setEditLiteralValue("");
  };

  // Parent level for contextual "Add Child" (null = root)
  const [createParentLevel, setCreateParentLevel] = useState<string | null>(null);

  // Requirement type state management
  const [createRequirementType, setCreateRequirementType] = useState<"condition" | "chaining">(
    "condition",
  );
  const [editRequirementType, setEditRequirementType] = useState<"condition" | "chaining">(
    "condition",
  );

  // Helper function to determine if a requirement is a chaining node
  const isChaining = (requirement: Requirement) => {
    return requirement.chainingOperator &&
      (!requirement.target || !requirement.operator || !requirement.value);
  };

  const {
    data: requirements,
    isLoading,
    currentUserId,
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
  } = useRulesetSection<Requirement, RequirementFormData>({
    rulesetId: ruleset.id,
    sectionName: `customization-${entityType}-${entityId}-requirements`,
    label: "Requirement",
    data: externalData,
    queryFn: !externalData ? async () => {
      const response = await rpc.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .requirements.$get({
          param: { id: ruleset.id, entityType, entityId },
        });
      if (!response.ok) throw new Error("Failed to fetch requirements");
      return response.json();
    } : undefined,
    queryKeysToInvalidate,
    createFn: async (data: RequirementFormData) => {
      const response = await rpc.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .requirements.$post({
          param: { id: ruleset.id, entityType: entityType, entityId: entityId },
          json: data,
        });
      if (!response.ok) throw new Error("Failed to create requirement");
      return response.json();
    },
    updateFn: async (requirementId: string, data: RequirementFormData) => {
      const response = await rpc.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .requirements[":requirement_id"].$put({
          param: {
            id: ruleset.id,
            entityType: entityType,
            entityId: entityId,
            requirement_id: requirementId,
          },
          json: data,
        });
      if (!response.ok) throw new Error("Failed to update requirement");
      return response.json();
    },
    deleteFn: async (requirementId: string) => {
      const response = await rpc.api.rulesets[":id"].customization[":entityType"][":entityId"]
        .requirements[":requirement_id"].$delete({
          param: {
            id: ruleset.id,
            entityType: entityType,
            entityId: entityId,
            requirement_id: requirementId,
          },
        });
      if (!response.ok) throw new Error("Failed to delete requirement");
      return response.json();
    },
    onCreateSuccess: handleResolvedEntityId,
    onUpdateSuccess: handleResolvedEntityId,
    onDeleteSuccess: handleResolvedEntityId,
  });

  const { canEdit } = usePermissions(ruleset, currentUserId);
  const canDelete = canEdit;
  const isPublished = ruleset.status === "Published";

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
      const node = nodeMap.get(requirement.level)!;
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
    const isTemplate = isTemplateValue(requirement.value || "");
    setEditTemplateMode(isTemplate);
    setEditTemplateExpression(isTemplate ? extractTemplateExpression(requirement.value || "") || "" : "");
    setEditLiteralValue(isTemplate ? "" : requirement.value || "");
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
                    <Stack direction="row" spacing={1} sx={{
                      alignItems: "center"
                    }}>
                      <Typography variant="body2" sx={{
                        color: "text.secondary"
                      }}>
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
                    {new Date(requirement.createdAt).toLocaleDateString()}
                  </Typography>

                  {canEdit && requirementIsChaining && (
                    <IconButton
                      size="small"
                      color="primary"
                      title="Add child requirement"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCreateParentLevel(node.level);
                        setCreateRequirementType("condition");
                        handleCreate();
                      }}
                    >
                      <AddIcon fontSize="small" />
                    </IconButton>
                  )}
                  {canEdit && (
                    <IconButton
                      size="small"
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
    <Box sx={{ width: "100%", maxWidth: 1200, margin: "0 auto" }}>
      {canEdit && (
        <Box sx={{ mb: 2, display: "flex", justifyContent: "flex-end" }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => {
              setCreateParentLevel(null);
              setCreateRequirementType("condition");
              handleCreate();
            }}
          >
            Add Requirement
          </Button>
        </Box>
      )}
      {/* Loading State */}
      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
          <DiceSpinner />
        </Box>
      )}
      {/* Content */}
      {!isLoading && (
        <>
          {requirementsTree.length === 0
            ? (
              <BlankState
                icon={<RequirementsIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
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
        onSubmit={(data) => {
          const level = computeNextLevel(createParentLevel);
          const cleanedData = createRequirementType === "chaining"
            ? {
              level,
              chainingOperator: data.chainingOperator,
            }
            : {
              level,
              target: data.target,
              operator: data.operator,
              value: createTemplateMode && createTemplateExpression.trim()
                ? `{{ ${createTemplateExpression} }}`
                : data.value,
            };

          createMutation.mutate(cleanedData);
        }}
        isLoading={createMutation.isPending}
        maxWidth="md"
      >
        {isPublished && (
          <Alert severity="warning">
            This ruleset is published. Changing requirements may break character validation for existing users.
          </Alert>
        )}
        <Box>
          <Typography variant="subtitle2" gutterBottom sx={{
            color: "text.secondary"
          }}>
            Type
          </Typography>
          <ToggleButtonGroup
            value={createRequirementType}
            exclusive
            onChange={(_, value) => {
              if (!value) return;
              setCreateRequirementType(value);
              if (value === "chaining") {
                createForm.unregister("target");
                createForm.unregister("operator");
                createForm.unregister("value");
              } else {
                createForm.unregister("chainingOperator");
              }
            }}
            size="small"
          >
            <ToggleButton value="condition">
              <Typography variant="body2">Condition</Typography>
            </ToggleButton>
            <ToggleButton value="chaining">
              <Typography variant="body2">Chaining</Typography>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {createRequirementType === "chaining"
          ? (
            <FormControl fullWidth>
              <InputLabel>Chaining Operator</InputLabel>
              <Select
                {...createForm.register("chainingOperator", {
                  required: "Chaining operator is required",
                })}
                value={createForm.watch("chainingOperator") || ""}
                onChange={(e) => {
                  createForm.setValue("chainingOperator", e.target.value);
                  createForm.clearErrors("chainingOperator");
                }}
                label="Chaining Operator"
                error={!!createForm.formState.errors.chainingOperator}
              >
                <MenuItem value="and">AND</MenuItem>
                <MenuItem value="or">OR</MenuItem>
              </Select>
              {createForm.formState.errors.chainingOperator && (
                <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                  {createForm.formState.errors.chainingOperator.message}
                </Typography>
              )}
            </FormControl>
          )
          : (
            <>
              <TargetPathInput
                rulesetId={ruleset.id}
                kind="requirement"
                value={createForm.watch("target") || ""}
                onChange={(value) => {
                  createForm.setValue("target", value);
                  createForm.clearErrors("target");
                }}
                onPathInfoChange={(pathInfo) => {
                  if (pathInfo) {
                    const valueType = pathInfo.valueType as "number" | "string" | "boolean";
                    setSelectedCreatePath({
                      path: createForm.watch("target") || "",
                      category: "",
                      description: "",
                      valueType,
                      operators: pathInfo.operators,
                      possibleValues: pathInfo.possibleValues,
                    });
                    createForm.setValue("value", defaultValueForPath(valueType, pathInfo.possibleValues));
                    createForm.setValue("operator", pathInfo.operators[0] ?? "");
                    createForm.clearErrors("operator");
                  } else {
                    setSelectedCreatePath(null);
                  }
                }}
                label="Target"
                error={!!createForm.formState.errors.target}
                helperText={createForm.formState.errors.target?.message}
              />
              <RequirementOperationSelect
                value={createForm.watch("operator") || ""}
                onChange={(value) => {
                  createForm.setValue("operator", value);
                  createForm.clearErrors("operator");
                }}
                error={!!createForm.formState.errors.operator}
                operators={selectedCreatePath?.operators || []}
                label="Operator"
              />
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: -1, flexWrap: "wrap" }}>
                <FormControlLabel
                  control={<Switch size="small" checked={createTemplateMode} onChange={(_, checked) => handleToggleCreateTemplate(checked)} />}
                  label="Template"
                />
                {createTemplateMode && (
                  <TemplateExpressionToolbar inputRef={createExpressionRef} disabled={!createTemplateMode} />
                )}
              </Box>
              {createTemplateMode ? (
                <TemplateExpressionInput
                  ref={createExpressionRef}
                  value={createTemplateExpression}
                  onChange={setCreateTemplateExpression}
                  rulesetId={ruleset.id}
                  kind="requirement"
                />
              ) : (
                <PathValueInput
                  value={createForm.watch("value") || ""}
                  onChange={(value) => {
                    createForm.setValue("value", value);
                    createForm.clearErrors("value");
                  }}
                  valueType={selectedCreatePath?.valueType}
                  possibleValues={selectedCreatePath?.possibleValues}
                  required
                  error={!!createForm.formState.errors.value}
                  helperText={createForm.formState.errors.value?.message}
                  placeholder={selectedCreatePath
                    ? (selectedCreatePath.valueType === "boolean"
                      ? "true or false"
                      : selectedCreatePath.valueType === "string"
                      ? "text value"
                      : "numeric value")
                    : "e.g., 13, 5, true"}
                />
              )}
            </>
          )}
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

          const cleanedData = editRequirementType === "chaining"
            ? {
              level: selectedRequirement.level,
              chainingOperator: data.chainingOperator,
            }
            : {
              level: selectedRequirement.level,
              target: data.target,
              operator: data.operator,
              value: editTemplateMode && editTemplateExpression.trim()
                ? `{{ ${editTemplateExpression} }}`
                : editLiteralValue,
            };

          updateMutation.mutate({ id: selectedRequirement.id, data: cleanedData });
        }}
        isLoading={updateMutation.isPending}
        maxWidth="md"
      >
        {isPublished && (
          <Alert severity="warning">
            This ruleset is published. Changing requirements may break character validation for existing users.
          </Alert>
        )}
        <Box>
          <Typography variant="subtitle2" gutterBottom sx={{
            color: "text.secondary"
          }}>
            Type
          </Typography>
          <ToggleButtonGroup
            value={editRequirementType}
            exclusive
            onChange={(_, value) => {
              if (!value) return;
              setEditRequirementType(value);
              if (value === "chaining") {
                editForm.unregister("target");
                editForm.unregister("operator");
                editForm.unregister("value");
              } else {
                editForm.unregister("chainingOperator");
              }
            }}
            size="small"
          >
            <ToggleButton value="condition">
              <Typography variant="body2">Condition</Typography>
            </ToggleButton>
            <ToggleButton value="chaining">
              <Typography variant="body2">Chaining</Typography>
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>

        {editRequirementType === "chaining"
          ? (
            <FormControl fullWidth>
              <InputLabel>Chaining Operator</InputLabel>
              <Select
                {...editForm.register("chainingOperator", {
                  required: "Chaining operator is required",
                })}
                value={editForm.watch("chainingOperator") || ""}
                onChange={(e) => {
                  editForm.setValue("chainingOperator", e.target.value);
                  editForm.clearErrors("chainingOperator");
                }}
                label="Chaining Operator"
                error={!!editForm.formState.errors.chainingOperator}
              >
                <MenuItem value="and">and</MenuItem>
                <MenuItem value="or">or</MenuItem>
              </Select>
              {editForm.formState.errors.chainingOperator && (
                <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                  {editForm.formState.errors.chainingOperator.message}
                </Typography>
              )}
            </FormControl>
          )
          : (
            <>
              <TargetPathInput
                rulesetId={ruleset.id}
                kind="requirement"
                value={editForm.watch("target") || ""}
                onChange={(value) => {
                  editForm.setValue("target", value);
                  editForm.clearErrors("target");
                }}
                onPathInfoChange={(pathInfo) => {
                  if (pathInfo) {
                    setSelectedEditPath({
                      path: editForm.watch("target") || "",
                      category: "",
                      description: "",
                      valueType: pathInfo.valueType as "number" | "string" | "boolean",
                      operators: pathInfo.operators,
                      possibleValues: pathInfo.possibleValues,
                    });
                    // If the existing operator isn't valid for the new path's
                    // operator list (only happens when the user changed the
                    // target), fall back to the first allowed operator.
                    if (!pathInfo.operators.includes(editForm.watch("operator") || "")) {
                      editForm.setValue("operator", pathInfo.operators[0] ?? "");
                      editForm.clearErrors("operator");
                    }
                  } else {
                    setSelectedEditPath(null);
                  }
                }}
                label="Target"
                error={!!editForm.formState.errors.target}
                helperText={editForm.formState.errors.target?.message}
              />
              <RequirementOperationSelect
                value={editForm.watch("operator") || ""}
                onChange={(value) => {
                  editForm.setValue("operator", value);
                  editForm.clearErrors("operator");
                }}
                error={!!editForm.formState.errors.operator}
                operators={selectedEditPath?.operators || []}
                label="Operator"
              />
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: -1, flexWrap: "wrap" }}>
                <FormControlLabel
                  control={<Switch size="small" checked={editTemplateMode} onChange={(_, checked) => handleToggleEditTemplate(checked)} />}
                  label="Template"
                />
                {editTemplateMode && (
                  <TemplateExpressionToolbar inputRef={editExpressionRef} disabled={!editTemplateMode} />
                )}
              </Box>
              {editTemplateMode ? (
                <TemplateExpressionInput
                  ref={editExpressionRef}
                  value={editTemplateExpression}
                  onChange={setEditTemplateExpression}
                  rulesetId={ruleset.id}
                  kind="requirement"
                />
              ) : (
                <PathValueInput
                  value={editLiteralValue}
                  onChange={setEditLiteralValue}
                  valueType={selectedEditPath?.valueType}
                  possibleValues={selectedEditPath?.possibleValues}
                  placeholder={selectedEditPath
                    ? (selectedEditPath.valueType === "boolean"
                      ? "true or false"
                      : selectedEditPath.valueType === "string"
                      ? "text value"
                      : "numeric value")
                    : "e.g., 13, 5, true"}
                />
              )}
            </>
          )}
      </EditDialog>
      <DeleteDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        title="Delete Requirement"
        message="Are you sure you want to delete this requirement? This action cannot be undone."
        onConfirm={confirmDelete}
        isLoading={deleteMutation.isPending}
      />
    </Box>
  );
}
