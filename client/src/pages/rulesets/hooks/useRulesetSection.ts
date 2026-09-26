import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type DefaultValues, type FieldValues, useForm } from "react-hook-form";

interface RulesetSectionConfig<TData, TFormData extends FieldValues> {
  rulesetId: string;
  sectionName: string;
  label: string;
  queryFn?: () => Promise<TData[]>;
  data?: TData[];
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
  /** Resolves to the created entity; its id is handed to `onCreateSuccess`. */
  createFn: (data: TFormData) => Promise<{ id: string }>;
  updateFn?: (id: string, data: TFormData) => Promise<unknown>;
  deleteFn?: (id: string) => Promise<unknown>;
  onCreateSuccess?: (created: { id: string }) => void;
  onUpdateSuccess?: (data: unknown) => void;
  onDeleteSuccess?: (data: unknown) => void;
  onEditDialogClose?: () => void;
  createDefaults?: DefaultValues<TFormData>;
}

const noopMutationFn = async () => {};

export function useRulesetSection<TData extends { id: string }, TFormData extends FieldValues>({
  rulesetId,
  sectionName,
  label,
  queryFn,
  data: externalData,
  queryKeysToInvalidate,
  createFn,
  updateFn,
  deleteFn,
  onCreateSuccess,
  onUpdateSuccess,
  onDeleteSuccess,
  onEditDialogClose,
  createDefaults,
}: RulesetSectionConfig<TData, TFormData>) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  // Dialog states
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // Selected items
  const [selectedItem, setSelectedItem] = useState<TData | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  // Forms
  const createForm = useForm<TFormData>({ defaultValues: createDefaults });
  const editForm = useForm<TFormData>();

  // Data query (only when queryFn is provided and no external data)
  const noopQueryFn = async () => [] as TData[];
  const { data: queryData, isLoading, error } = useQuery({
    queryKey: queryKeys.rulesets.section(rulesetId, sectionName),
    queryFn: queryFn ?? noopQueryFn,
    enabled: !externalData && !!queryFn && !!rulesetId,
  });

  const data = externalData ?? queryData;

  const closeEditDialog = () => {
    setEditDialogOpen(false);
    setSelectedItem(null);
    editForm.reset();
    onEditDialogClose?.();
  };

  // Mutations
  const invalidateOnMutation = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(rulesetId, sectionName) });
    for (const queryKey of queryKeysToInvalidate ?? []) {
      queryClient.invalidateQueries({ queryKey });
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.changes(rulesetId) });
  };

  const createMutation = useMutation({
    mutationFn: createFn,
    onSuccess: (data) => {
      snackbar.success(`${label} created successfully`);
      invalidateOnMutation();
      setCreateDialogOpen(false);
      createForm.reset(createDefaults);
      onCreateSuccess?.(data);
    },
    onError: (error) => {
      snackbar.error(error, `Failed to create ${label}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateFn
      ? ({ id, data }: { id: string; data: TFormData }) => updateFn(id, data)
      : noopMutationFn,
    onSuccess: (data) => {
      snackbar.success(`${label} updated successfully`);
      invalidateOnMutation();
      closeEditDialog();
      onUpdateSuccess?.(data);
    },
    onError: (error) => {
      snackbar.error(error, `Failed to update ${label}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFn ?? noopMutationFn,
    onSuccess: (data) => {
      invalidateOnMutation();
      setDeleteDialogOpen(false);
      snackbar.success(`${label} deleted successfully`);
      setItemToDelete(null);
      onDeleteSuccess?.(data);
    },
    onError: (error) => {
      snackbar.error(error, `Failed to delete ${label}`);
    },
  });

  // Action handlers
  const handleCreate = () => {
    setCreateDialogOpen(true);
  };

  const handleEdit = (item: TData, resetData?: TFormData) => {
    setSelectedItem(item);
    if (resetData) {
      editForm.reset(resetData);
    }
    setEditDialogOpen(true);
  };

  const handleDelete = (itemId: string) => {
    setItemToDelete(itemId);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (itemToDelete) {
      deleteMutation.mutate(itemToDelete);
    }
  };

  return {
    // Data
    data,
    isLoading,
    error,

    // Dialog states
    createDialogOpen,
    editDialogOpen,
    deleteDialogOpen,
    setCreateDialogOpen,
    setEditDialogOpen,
    closeEditDialog,
    setDeleteDialogOpen,

    // Selected items
    selectedItem,
    itemToDelete,
    setSelectedItem,

    // Forms
    createForm,
    editForm,

    // Mutations
    createMutation,
    updateMutation,
    deleteMutation,

    // Handlers
    handleCreate,
    handleEdit,
    handleDelete,
    confirmDelete,
  };
}
