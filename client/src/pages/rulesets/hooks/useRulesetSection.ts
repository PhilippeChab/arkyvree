import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type DefaultValues, type FieldValues } from "react-hook-form";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";

interface RulesetSectionConfig<
  TData,
  TFormData extends FieldValues,
  TCreated extends { id: string },
  TUpdated,
  TDeleted,
> {
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
  /** Every field's value in an empty form: the create form's, and the edit form's until a row's values replace them */
  createDefaults: TFormData & DefaultValues<TFormData>;
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

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [selectedItem, setSelectedItem] = useState<TData | null>(null);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);

  const createForm = useFormWith<TFormData>(createDefaults);
  const editForm = useFormWith<TFormData>(createDefaults);

  // Data query (only when queryFn is provided and no external data)
  const {
    data: queryData,
    isLoading,
    error,
  } = useQuery({
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
      snackbar.success(`${label} created`);
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
      snackbar.success(`${label} updated`);
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
      snackbar.success(`${label} deleted`);
      setItemToDelete(null);
      onDeleteSuccess?.(data);
    },
    onError: (error) => {
      snackbar.error(error, `Failed to delete ${label}`);
    },
  });

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
    data,
    isLoading,
    error,

    createDialogOpen,
    editDialogOpen,
    deleteDialogOpen,
    setCreateDialogOpen,
    setEditDialogOpen,
    closeEditDialog,
    setDeleteDialogOpen,

    selectedItem,
    itemToDelete,
    setSelectedItem,

    createForm,
    editForm,

    createMutation,
    updateMutation,
    deleteMutation,

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
