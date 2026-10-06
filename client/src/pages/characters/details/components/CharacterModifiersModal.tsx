import { Button, Chip, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useState } from "react";

import {
  CreateDialog,
  DataTable,
  type DataTableColumn,
  DeleteDialog,
  EditDialog,
  FaqHelpIcon,
  Modal,
} from "@/client/src/components/common/index.ts";
import {
  EMPTY_MODIFIER,
  ModifierForm,
  type ModifierFormData,
  TargetPathBreadcrumbs,
} from "@/client/src/components/customization/index.ts";
import { AddIcon, DeleteIcon, DuplicateIcon, EditIcon, ModifiersIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { MODIFIER_OPERATOR_LABELS } from "@/client/src/lib/operatorLabels.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { extractTemplatePath } from "@/client/src/lib/templateValues.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

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

/** A character's modifiers' columns; each row's actions sit over its last. */
const MODIFIER_COLUMNS: DataTableColumn[] = [
  { key: "target", label: "Target", width: "45%" },
  { key: "operator", label: "Operator", width: "20%" },
  { key: "value", label: "Value", width: "35%" },
];

export function CharacterModifiersModal({ open, onClose, characterId, rulesetId }: CharacterModifiersModalProps) {
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedModifier, setSelectedModifier] = useState<Modifier | null>(null);

  const createForm = useFormWith<ModifierFormData>(EMPTY_MODIFIER);
  const editForm = useFormWith<ModifierFormData>(EMPTY_MODIFIER);

  const { data: modifiers = [], isLoading } = useQuery({
    queryKey: queryKeys.characters.modifiers(characterId),
    queryFn: async () => {
      return parseResponse(
        rpc.api.characters.modifiers[":characterId"].modifiers.$get({
          param: { characterId },
        }),
      );
    },
    enabled: open,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.characters.detail(characterId) });
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
        maxWidth="md"
        slotProps={{
          paper: { sx: { minHeight: { sm: "50vh" } } },
        }}
      >
        <DialogTitle>
          <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
            <span>Manage Modifiers</span>
            <FaqHelpIcon
              text="Modifiers affect character attributes with operations like add, subtract, multiply. They can modify things like strength, AC, skills, etc."
              size={18}
            />
          </Stack>
        </DialogTitle>

        <DialogContent dividers sx={{ overflowY: "auto", scrollbarGutter: "stable" }}>
          <Stack direction="row" sx={{ justifyContent: "flex-end", mb: 2 }}>
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleAdd}>
              Add Modifier
            </Button>
          </Stack>
          <DataTable
            rows={modifiers}
            isLoading={isLoading}
            columns={MODIFIER_COLUMNS}
            size="small"
            minWidth={0}
            renderCell={(mod, column) => {
              if (column === "target")
                return <TargetPathBreadcrumbs target={mod.target} targetLabels={mod.targetLabels} />;
              if (column === "operator") {
                return (
                  <Chip
                    label={MODIFIER_OPERATOR_LABELS[mod.operator] || mod.operator}
                    size="small"
                    color="secondary"
                    variant="outlined"
                  />
                );
              }
              const templatePath = extractTemplatePath(mod.value);
              return templatePath ? (
                <TargetPathBreadcrumbs target={templatePath} targetLabels={mod.targetLabels} />
              ) : (
                <Typography variant="body2">{mod.value}</Typography>
              );
            }}
            actions={(mod) => [
              { label: "Edit modifier", icon: <EditIcon fontSize="small" />, onClick: () => handleEdit(mod) },
              {
                label: "Duplicate modifier",
                icon: <DuplicateIcon fontSize="small" />,
                onClick: () => handleDuplicate(mod),
              },
              {
                label: "Delete modifier",
                icon: <DeleteIcon fontSize="small" />,
                onClick: () => handleDelete(mod),
                color: "error",
              },
            ]}
            empty={{
              icon: ModifiersIcon,
              title: "No modifiers",
              description: "Add custom bonuses or overrides to this character.",
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} variant="outlined" color="inherit">
            Close
          </Button>
        </DialogActions>
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
