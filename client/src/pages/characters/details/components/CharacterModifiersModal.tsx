import {
  Chip,
  DialogContent,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Toolbar,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { useState } from "react";

import {
  AddButton,
  BlankState,
  CreateDialog,
  DeleteDialog,
  DiceSpinner,
  EditDialog,
  FaqHelpIcon,
  LoadError,
  Modal,
  ROW_ACTIONS_HOVER_SX,
  ROW_ACTIONS_SX,
} from "@/client/src/components/common/index.ts";
import {
  EMPTY_MODIFIER,
  ModifierForm,
  type ModifierFormData,
  TargetPathBreadcrumbs,
} from "@/client/src/components/customization/index.ts";
import { CloseIcon, ContentCopyIcon, DeleteIcon, EditIcon, TuneIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { MODIFIER_OPERATOR_LABELS } from "@/client/src/lib/operatorLabels.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { characterModifiersQuery } from "@/client/src/pages/characters/characterQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { extractTemplatePath } from "@/shared/customization/templateExpression.ts";

interface CharacterModifiersModalProps {
  open: boolean;
  onClose: () => void;
  characterId: string;
  rulesetId: string;
}

type Modifier = InferResponseType<
  (typeof rpc.api.characters.modifiers)[":characterId"]["modifiers"]["$get"],
  200
>[number];

export function CharacterModifiersModal({ open, onClose, characterId, rulesetId }: CharacterModifiersModalProps) {
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedModifier, setSelectedModifier] = useState<Modifier | null>(null);

  const createForm = useFormWith<ModifierFormData>(EMPTY_MODIFIER);
  const editForm = useFormWith<ModifierFormData>(EMPTY_MODIFIER);

  const {
    data: modifiers = [],
    isLoading,
    error,
  } = useQuery({ ...characterModifiersQuery(characterId), enabled: open });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.characters.detail(characterId) });
  };

  const createMutation = useMutation({
    mutationFn: async (data: ModifierFormData) => {
      return parseResponse(
        rpc.api.characters.modifiers[":characterId"].modifiers.$post({
          param: { characterId },
          json: data,
        }),
      );
    },
    onSuccess: () => {
      snackbar.success("Modifier created");
      setCreateOpen(false);
      invalidate();
    },
    onError: (error) => snackbar.error(error, "Failed to create modifier"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, updatedAt }: { id: string; data: ModifierFormData; updatedAt?: string }) => {
      return parseResponse(
        rpc.api.characters.modifiers[":characterId"].modifiers[":modifierId"].$put({
          param: { characterId, modifierId: id },
          json: { ...data, updatedAt },
        }),
      );
    },
    onSuccess: () => {
      snackbar.success("Modifier updated");
      setEditOpen(false);
      setSelectedModifier(null);
      invalidate();
    },
    onError: (error) => snackbar.error(error, "Failed to update modifier"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return parseResponse(
        rpc.api.characters.modifiers[":characterId"].modifiers[":modifierId"].$delete({
          param: { characterId, modifierId: id },
        }),
      );
    },
    onSuccess: () => {
      snackbar.success("Modifier deleted");
      setDeleteOpen(false);
      setSelectedModifier(null);
      invalidate();
    },
    onError: (error) => snackbar.error(error, "Failed to delete modifier"),
  });

  const handleEdit = (modifier: Modifier) => {
    setSelectedModifier(modifier);
    editForm.reset({ target: modifier.target, value: modifier.value, operator: modifier.operator });
    setEditOpen(true);
  };

  // The create dialog keeps its values while it fades out, and starts afresh when opened.
  const handleAdd = () => {
    createForm.reset();
    setCreateOpen(true);
  };

  const handleDuplicate = (modifier: Modifier) => {
    createForm.reset(
      {
        target: modifier.target,
        value: modifier.value,
        operator: modifier.operator,
      },
      { keepDefaultValues: true },
    );
    setCreateOpen(true);
  };

  const handleDelete = (modifier: Modifier) => {
    setSelectedModifier(modifier);
    setDeleteOpen(true);
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        aria-labelledby="character-modifiers-title"
        maxWidth="md"
        slotProps={{
          paper: { sx: { minHeight: { sm: "50vh" } } },
        }}
      >
        <Toolbar sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center", flex: 1 }}>
            <Typography id="character-modifiers-title" variant="h6" component="h2" sx={{ fontWeight: 600 }}>
              Manage Modifiers
            </Typography>
            <FaqHelpIcon
              text="Modifiers affect character attributes with operations like add, subtract, multiply. They can modify things like strength, AC, skills, etc."
              size={18}
            />
          </Stack>
          <Stack direction="row" spacing={1}>
            <AddButton size="small" label="Add" onClick={handleAdd} />
            <IconButton aria-label="Close" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Stack>
        </Toolbar>

        <DialogContent sx={{ overflowY: "auto", scrollbarGutter: "stable" }}>
          {isLoading ? (
            <DiceSpinner sx={{ py: 8 }} />
          ) : error && modifiers.length === 0 ? (
            <LoadError what="Modifiers" error={error} />
          ) : modifiers.length === 0 ? (
            <BlankState
              icon={TuneIcon}
              title="No modifiers"
              description="Add custom bonuses or overrides to this character."
            />
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, width: "40%" }}>Target</TableCell>
                    <TableCell sx={{ fontWeight: 600, width: "15%" }}>Operator</TableCell>
                    <TableCell sx={{ fontWeight: 600, width: "25%" }}>Value</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, width: "20%" }} />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {modifiers.map((mod) => (
                    <TableRow
                      key={mod.id}
                      hover
                      sx={{
                        position: "relative",
                        ...ROW_ACTIONS_HOVER_SX,
                      }}
                    >
                      <TableCell>
                        <TargetPathBreadcrumbs target={mod.target} targetLabels={mod.targetLabels} />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={MODIFIER_OPERATOR_LABELS[mod.operator] || mod.operator}
                          size="small"
                          color="secondary"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        {(() => {
                          const templatePath = extractTemplatePath(mod.value);
                          if (templatePath)
                            return <TargetPathBreadcrumbs target={templatePath} targetLabels={mod.targetLabels} />;

                          return <Typography variant="body2">{mod.value}</Typography>;
                        })()}
                      </TableCell>
                      <TableCell align="right">
                        <Stack
                          direction="row"
                          spacing={0.5}
                          className="row-actions"
                          sx={{ justifyContent: "flex-end", ...ROW_ACTIONS_SX }}
                        >
                          <IconButton size="small" aria-label="Edit Modifier" onClick={() => handleEdit(mod)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" aria-label="Duplicate Modifier" onClick={() => handleDuplicate(mod)}>
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            size="small"
                            color="error"
                            aria-label="Delete Modifier"
                            onClick={() => handleDelete(mod)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
      </Modal>
      <CreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Modifier"
        form={createForm}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
        maxWidth="md"
      >
        <ModifierForm form={createForm} rulesetId={rulesetId} entityType="characters" mode="create" />
      </CreateDialog>
      <EditDialog
        open={editOpen}
        onClose={() => {
          setEditOpen(false);
          setSelectedModifier(null);
        }}
        title="Edit Modifier"
        form={editForm}
        onSubmit={(data) => selectedModifier && updateMutation.mutate({ id: selectedModifier.id, data })}
        isLoading={updateMutation.isPending}
        maxWidth="md"
      >
        <ModifierForm form={editForm} rulesetId={rulesetId} entityType="characters" mode="edit" />
      </EditDialog>
      <DeleteDialog
        open={deleteOpen}
        onClose={() => {
          setDeleteOpen(false);
          setSelectedModifier(null);
        }}
        onConfirm={() => selectedModifier && deleteMutation.mutate(selectedModifier.id)}
        title="Delete Modifier"
        message="Are you sure you want to delete this modifier? This action cannot be undone."
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
