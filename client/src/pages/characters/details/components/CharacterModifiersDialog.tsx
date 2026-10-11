import {
  DialogContent,
  DialogContentText,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type InferResponseType, parseResponse } from "hono/client";
import { useState } from "react";

import {
  AddButton,
  BlankNote,
  CreateDialog,
  DeleteDialog,
  DialogFooter,
  DiceSpinner,
  EditDialog,
  HelpLabel,
  LoadError,
  Modal,
  ROW_ACTIONS_HOVER_SX,
  RowAction,
  RowActions,
  TableFrame,
} from "@/client/src/components/common/index.ts";
import {
  EMPTY_MODIFIER,
  type ModifierFormData,
  ModifierFormFields,
  ModifierOperatorCell,
  MODIFIERS_HELP,
  ModifierTargetCell,
  ModifierValueCell,
} from "@/client/src/components/customization/index.ts";
import { CopyIcon, DeleteIcon, EditIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useFormWith } from "@/client/src/hooks/index.ts";
import { invalidateCharacter } from "@/client/src/lib/queries.ts";
import { characterModifiersQuery } from "@/client/src/pages/characters/characterQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

interface CharacterModifiersDialogProps {
  characterId: string;
  onClose: () => void;
  open: boolean;
  rulesetId: string;
}

type Modifier = InferResponseType<
  (typeof rpc.api.characters.modifiers)[":characterId"]["modifiers"]["$get"],
  200
>[number];

/** A character's own modifiers: listed, added, edited and deleted. */
export function CharacterModifiersDialog({ open, onClose, characterId, rulesetId }: CharacterModifiersDialogProps) {
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  // The modifier an edit or a delete is about, kept while its dialog fades out
  const editDialog = useDialogState<Modifier>();
  const deleteDialog = useDialogState<Modifier>();

  const createForm = useFormWith<ModifierFormData>(EMPTY_MODIFIER);
  const editForm = useFormWith<ModifierFormData>(EMPTY_MODIFIER);

  const {
    data: modifiers = [],
    isLoading,
    error,
  } = useQuery({ ...characterModifiersQuery(characterId), enabled: open });

  const invalidate = () => invalidateCharacter(queryClient, characterId);

  const createMutation = useMutation({
    mutationFn: async (data: ModifierFormData) =>
      parseResponse(
        rpc.api.characters.modifiers[":characterId"].modifiers.$post({
          param: { characterId },
          json: data,
        }),
      ),
    onSuccess: () => {
      snackbar.success("Modifier added");
      setCreateOpen(false);
      invalidate();
    },
    onError: (error) => snackbar.error(error, "Failed to add modifier"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, updatedAt }: { data: ModifierFormData; id: string; updatedAt?: string }) =>
      parseResponse(
        rpc.api.characters.modifiers[":characterId"].modifiers[":modifierId"].$put({
          param: { characterId, modifierId: id },
          json: { ...data, updatedAt },
        }),
      ),
    onSuccess: () => {
      snackbar.success("Modifier updated");
      editDialog.close();
      invalidate();
    },
    onError: (error) => snackbar.error(error, "Failed to update modifier"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) =>
      parseResponse(
        rpc.api.characters.modifiers[":characterId"].modifiers[":modifierId"].$delete({
          param: { characterId, modifierId: id },
        }),
      ),
    onSuccess: () => {
      snackbar.success("Modifier deleted");
      deleteDialog.close();
      invalidate();
    },
    onError: (error) => snackbar.error(error, "Failed to delete modifier"),
  });

  const handleEdit = (modifier: Modifier) => {
    editForm.reset({ target: modifier.target, value: modifier.value, operator: modifier.operator });
    editDialog.openWith(modifier);
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

  const handleDelete = (modifier: Modifier) => deleteDialog.openWith(modifier);

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        maxWidth="md"
        slotProps={{
          paper: { sx: { minHeight: { sm: "50vh" } } },
        }}
      >
        <DialogTitle>
          <HelpLabel label="Manage Modifiers" help={MODIFIERS_HELP} />
        </DialogTitle>
        <DialogContent sx={{ overflowY: "auto", scrollbarGutter: "stable" }}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ justifyContent: "space-between", alignItems: "center" }}>
              <DialogContentText>Custom bonuses and overrides of this character's own.</DialogContentText>
              <AddButton label="Add Modifier" onClick={handleAdd} />
            </Stack>
            {isLoading ? (
              <DiceSpinner sx={{ py: 4 }} />
            ) : error && modifiers.length === 0 ? (
              <LoadError what="Modifiers" error={error} />
            ) : modifiers.length === 0 ? (
              <BlankNote>No modifiers</BlankNote>
            ) : (
              <TableFrame>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: "40%" }}>Target</TableCell>
                      <TableCell sx={{ width: "15%" }}>Operator</TableCell>
                      <TableCell sx={{ width: "25%" }}>Value</TableCell>
                      <TableCell align="right" sx={{ width: "20%" }}>
                        Actions
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {modifiers.map((mod) => (
                      <TableRow
                        key={mod.id}
                        sx={{
                          position: "relative",
                          ...ROW_ACTIONS_HOVER_SX,
                        }}
                      >
                        <TableCell>
                          <ModifierTargetCell modifier={mod} />
                        </TableCell>
                        <TableCell>
                          <ModifierOperatorCell modifier={mod} />
                        </TableCell>
                        <TableCell>
                          <ModifierValueCell modifier={mod} />
                        </TableCell>
                        <TableCell align="right">
                          <RowActions>
                            <RowAction icon={EditIcon} label="Edit" onClick={() => handleEdit(mod)} />
                            <RowAction icon={CopyIcon} label="Duplicate" onClick={() => handleDuplicate(mod)} />
                            <RowAction
                              icon={DeleteIcon}
                              label="Delete"
                              intent="destructive"
                              onClick={() => handleDelete(mod)}
                            />
                          </RowActions>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableFrame>
            )}
          </Stack>
        </DialogContent>
        <DialogFooter onCancel={onClose} cancelLabel="Close" />
      </Modal>
      <CreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Modifier"
        form={createForm}
        onSubmit={(data) => createMutation.mutate(data)}
        pending={createMutation.isPending}
        submitLabel="Add Modifier"
        maxWidth="md"
      >
        <ModifierFormFields form={createForm} rulesetId={rulesetId} entityType="characters" mode="create" />
      </CreateDialog>
      <EditDialog
        open={editDialog.open}
        onClose={editDialog.close}
        title="Edit Modifier"
        form={editForm}
        onSubmit={(data) =>
          editDialog.target &&
          updateMutation.mutate({ id: editDialog.target.id, data, updatedAt: editDialog.target.updatedAt })
        }
        pending={updateMutation.isPending}
        maxWidth="md"
      >
        <ModifierFormFields form={editForm} rulesetId={rulesetId} entityType="characters" mode="edit" />
      </EditDialog>
      <DeleteDialog
        open={deleteDialog.open}
        onClose={deleteDialog.close}
        onConfirm={() => deleteDialog.target && deleteMutation.mutate(deleteDialog.target.id)}
        title="Delete Modifier"
        message="Are you sure you want to delete this modifier? This action cannot be undone."
        pending={deleteMutation.isPending}
      />
    </>
  );
}
