import {
  BlankState,
  FaqHelpIcon,
  CreateDialog,
  DeleteDialog,
  EditDialog,
  DiceSpinner,
  Modal,
} from "@/client/src/components/common/index.ts";
import {
  ModifierForm,
  type ModifierFormData,
  TargetPathBreadcrumbs,
} from "@/client/src/components/customization/index.ts";
import { MODIFIER_OPERATOR_LABELS } from "@/client/src/lib/operatorLabels.ts";
import { extractTemplatePath } from "@/client/src/lib/templateValues.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useIsMobile } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import {
  Add as AddIcon,
  Close as CloseIcon,
  ContentCopy as ContentCopyIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Tune as TuneIcon,
} from "@mui/icons-material";
import {
  Box,
  Button,
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
import type { InferResponseType } from "hono/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useForm } from "react-hook-form";

type Modifier = InferResponseType<(typeof rpc.api.characters.modifiers)[":characterId"]["modifiers"]["$get"], 200>[number];

interface CharacterModifiersModalProps {
  open: boolean;
  onClose: () => void;
  characterId: string;
  rulesetId: string;
}

export function CharacterModifiersModal({ open, onClose, characterId, rulesetId }: CharacterModifiersModalProps) {
  const isMobile = useIsMobile();
  const snackbar = useSnackbar();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedModifier, setSelectedModifier] = useState<Modifier | null>(null);

  const createForm = useForm<ModifierFormData>({ defaultValues: { target: "", value: "", operator: "" } });
  const editForm = useForm<ModifierFormData>({ defaultValues: { target: "", value: "", operator: "" } });

  const { data: modifiers = [], isLoading } = useQuery({
    queryKey: [...queryKeys.characters.detail(characterId), "modifiers"],
    queryFn: async () => {
      const response = await rpc.api.characters.modifiers[":characterId"].modifiers.$get({
        param: { characterId },
      });
      if (!response.ok) throw new Error("Failed to fetch modifiers");
      return response.json();
    },
    enabled: open,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.characters.detail(characterId) });
  };

  const createMutation = useMutation({
    mutationFn: async (data: ModifierFormData) => {
      const response = await rpc.api.characters.modifiers[":characterId"].modifiers.$post({
        param: { characterId },
        json: data,
      });
      if (!response.ok) throw new Error("Failed to create modifier");
      return response.json();
    },
    onSuccess: () => {
      snackbar.success("Modifier created");
      setCreateOpen(false);
      createForm.reset();
      invalidate();
    },
    onError: (error) => snackbar.error(error),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, updatedAt }: { id: string; data: ModifierFormData; updatedAt?: string }) => {
      const response = await rpc.api.characters.modifiers[":characterId"].modifiers[":modifierId"].$put({
        param: { characterId, modifierId: id },
        json: { ...data, updatedAt },
      });
      if (!response.ok) throw new Error("Failed to update modifier");
      return response.json();
    },
    onSuccess: () => {
      snackbar.success("Modifier updated");
      setEditOpen(false);
      setSelectedModifier(null);
      invalidate();
    },
    onError: (error) => snackbar.error(error),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await rpc.api.characters.modifiers[":characterId"].modifiers[":modifierId"].$delete({
        param: { characterId, modifierId: id },
      });
      if (!response.ok) throw new Error("Failed to delete modifier");
      return response.json();
    },
    onSuccess: () => {
      snackbar.success("Modifier deleted");
      setDeleteOpen(false);
      setSelectedModifier(null);
      invalidate();
    },
    onError: (error) => snackbar.error(error),
  });

  const handleEdit = (modifier: Modifier) => {
    setSelectedModifier(modifier);
    editForm.reset({ target: modifier.target, value: modifier.value, operator: modifier.operator });
    setEditOpen(true);
  };

  const handleDuplicate = (modifier: Modifier) => {
    createForm.reset({
      target: modifier.target,
      value: modifier.value,
      operator: modifier.operator,
    });
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
          paper: { sx: { minHeight: { sm: "50vh" } } }
        }}
      >
        <Toolbar sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Manage Modifiers
            </Typography>
            <FaqHelpIcon text="Modifiers affect character attributes with operations like add, subtract, multiply. They can modify things like strength, AC, skills, etc." size={18} />
          </Box>
          <Stack direction="row" spacing={1}>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setCreateOpen(true)}
            >
              Add
            </Button>
            <IconButton edge="end" onClick={onClose}>
              <CloseIcon />
            </IconButton>
          </Stack>
        </Toolbar>

        <DialogContent sx={{ overflowY: "auto", scrollbarGutter: "stable" }}>
          {isLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 8 }}>
              <DiceSpinner />
            </Box>
          ) : modifiers.length === 0 ? (
            <BlankState
              icon={<TuneIcon sx={{ fontSize: { xs: 56, sm: 80 }, color: "text.secondary", mb: 2 }} />}
              title="No modifiers"
              description="Add custom bonuses or overrides to this character."
            />
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "grey.100" }}>
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
                        "&:hover .row-actions": { opacity: 1 },
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
                          if (templatePath) {
                            return <TargetPathBreadcrumbs target={templatePath} targetLabels={mod.targetLabels} />;
                          }
                          return <Typography variant="body2">{mod.value}</Typography>;
                        })()}
                      </TableCell>
                      <TableCell align="right">
                        <Box
                          className="row-actions"
                          sx={{
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: 0.5,
                            opacity: isMobile ? 1 : 0,
                            transition: "opacity 0.2s ease",
                          }}
                        >
                          <IconButton size="small" onClick={() => handleEdit(mod)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => handleDuplicate(mod)}>
                            <ContentCopyIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" color="error" onClick={() => handleDelete(mod)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
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
        onClose={() => { setCreateOpen(false); createForm.reset(); }}
        title="Add Modifier"
        form={createForm}
        onSubmit={(data) => createMutation.mutate(data)}
        isLoading={createMutation.isPending}
        maxWidth="md"
      >
        <ModifierForm form={createForm} rulesetId={rulesetId} mode="create" />
      </CreateDialog>
      <EditDialog
        open={editOpen}
        onClose={() => { setEditOpen(false); setSelectedModifier(null); }}
        title="Edit Modifier"
        form={editForm}
        onSubmit={(data) => selectedModifier && updateMutation.mutate({ id: selectedModifier.id, data })}
        isLoading={updateMutation.isPending}
        maxWidth="md"
      >
        <ModifierForm form={editForm} rulesetId={rulesetId} mode="edit" />
      </EditDialog>
      <DeleteDialog
        open={deleteOpen}
        onClose={() => { setDeleteOpen(false); setSelectedModifier(null); }}
        onConfirm={() => selectedModifier && deleteMutation.mutate(selectedModifier.id)}
        title="Delete Modifier"
        message="Are you sure you want to delete this modifier?"
        isLoading={deleteMutation.isPending}
      />
    </>
  );
}
