import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { useMutation, useQuery, useQueryClient, skipToken } from "@tanstack/react-query";
import { useState } from "react";
import { type DefaultValues, type FieldValues, useForm } from "react-hook-form";

interface RulesetSectionConfig<TData, TFormData extends FieldValues, TCreated extends { id: string }, TUpdated, TDeleted> {
  rulesetId: string;
  sectionName: string;
  label: string;
  queryFn?: () => Promise<TData[]>;
  data?: TData[];
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
  /** Resolves to the created entity; its id is handed to `onCreateSuccess`. */
  createFn: (data: TFormData) => Promise<TCreated>;
  updateFn?: (id: string, data: TFormData) => Promise<TUpdated>;
  deleteFn?: (id: string) => Promise<TDeleted>;
  onCreateSuccess?: (created: TCreated) => void;
  onUpdateSuccess?: (data: TUpdated) => void;
  onDeleteSuccess?: (data: TDeleted) => void;
  onEditDialogClose?: () => void;
  createDefaults?: DefaultValues<TFormData>;
}

export function useRulesetSection<
  TData extends { id: string },
  TFormData extends FieldValues,
  TCreated extends { id: string } = { id: string },
  TUpdated = unknown,
  TDeleted = unknown,
>({
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
}: RulesetSectionConfig<TData, TFormData, TCreated, TUpdated, TDeleted>) {
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
  const { data: queryData, isLoading, error } = useQuery({
    queryKey: queryKeys.rulesets.section(rulesetId, sectionName),
    queryFn: !externalData && queryFn && rulesetId ? queryFn : skipToken,
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
    mutationFn: ({ id, data }: { id: string; data: TFormData }) =>
      updateFn ? updateFn(id, data) : Promise.reject(new Error(`${label} can't be updated here`)),
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
    mutationFn: (id: string) => (deleteFn ? deleteFn(id) : Promise.reject(new Error(`${label} can't be deleted here`))),
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

    /** The create dialog's wiring: `<CreateDialog {...createDialogProps} title="…">`. */
    createDialogProps: {
      open: createDialogOpen,
      onClose: () => setCreateDialogOpen(false),
      form: createForm,
      onSubmit: (data: TFormData) => createMutation.mutate(data),
      isLoading: createMutation.isPending,
    },
  };
}
