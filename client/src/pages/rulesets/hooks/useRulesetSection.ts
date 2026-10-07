import { type DefaultError, useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { type DefaultValues, type FieldValues } from "react-hook-form";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useFormWith } from "@/client/src/hooks/index.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { heldSectionQuery, invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";

interface RulesetSectionConfig<
  TData,
  TFormData extends FieldValues,
  TCreated extends { id: string },
  TUpdated,
  TDeleted,
> {
  /** Every field's value in an empty form: the create form's, and the edit form's until a row's values replace them */
  createDefaults: TFormData & DefaultValues<TFormData>;
  /** Resolves to the created entity; its id is handed to `onCreateSuccess`. */
  createFn: (data: TFormData) => Promise<TCreated>;
  data?: TData[];
  deleteFn?: (id: string) => Promise<TDeleted>;
  label: string;
  onCreateSuccess?: (created: TCreated) => void;
  onDeleteSuccess?: (data: TDeleted) => void;
  onUpdateSuccess?: (data: TUpdated) => void;
  /** The section's own rows, a factory's options (`modifiersQuery(…)`), read unless `data` hands them over */
  query?: UseQueryOptions<TData[], DefaultError, TData[], SectionKey>;
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
  rulesetId: string;
  sectionName: string;
  /** Saves a row's edit, `updatedAt` its stale-edit token: the row's, as its edit dialog opened on it. */
  updateFn?: (id: string, data: TFormData, updatedAt: string | undefined) => Promise<TUpdated>;
}

/** Where a section's rows are cached, which its saves refresh */
type SectionKey = ReturnType<typeof QUERY_KEYS.rulesets.section>;

export function useRulesetSection<
  TData extends { id: string; updatedAt?: string },
  TFormData extends FieldValues,
  TCreated extends { id: string } = { id: string },
  TUpdated = unknown,
  TDeleted = unknown,
>({
  rulesetId,
  sectionName,
  label,
  query,
  data: externalData,
  queryKeysToInvalidate,
  createFn,
  updateFn,
  deleteFn,
  onCreateSuccess,
  onUpdateSuccess,
  onDeleteSuccess,
  createDefaults,
}: RulesetSectionConfig<TData, TFormData, TCreated, TUpdated, TDeleted>) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  // A row's edit and delete dialogs keep it while they fade out
  const editDialog = useDialogState<TData>();
  const deleteDialog = useDialogState<string>();

  const createForm = useFormWith<TFormData>(createDefaults);
  const editForm = useFormWith<TFormData>(createDefaults);

  // A section handed its rows, or with none of its own to read, keeps its query idle
  const {
    data: queryData,
    isLoading,
    error,
  } = useQuery<TData[], DefaultError, TData[], SectionKey>(
    query && !externalData ? query : heldSectionQuery<TData>(rulesetId, sectionName),
  );

  const data = externalData ?? queryData;

  const invalidateOnMutation = () =>
    invalidateRulesetEdit(queryClient, rulesetId, [
      QUERY_KEYS.rulesets.section(rulesetId, sectionName),
      ...(queryKeysToInvalidate ?? []),
    ]);

  const createMutation = useMutation({
    mutationFn: createFn,
    onSuccess: (data) => {
      snackbar.success(`${label} created`);
      invalidateOnMutation();
      setCreateDialogOpen(false);
      onCreateSuccess?.(data);
    },
    onError: (error) => {
      snackbar.error(error, `Failed to create ${label.toLowerCase()}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data, updatedAt }: { data: TFormData; id: string; updatedAt?: string }) =>
      updateFn ? updateFn(id, data, updatedAt) : Promise.reject(new Error(`${label} can't be updated here`)),
    onSuccess: (data) => {
      snackbar.success(`${label} updated`);
      invalidateOnMutation();
      editDialog.close();
      onUpdateSuccess?.(data);
    },
    onError: (error) => {
      snackbar.error(error, `Failed to update ${label.toLowerCase()}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => (deleteFn ? deleteFn(id) : Promise.reject(new Error(`${label} can't be deleted here`))),
    onSuccess: (data) => {
      invalidateOnMutation();
      deleteDialog.close();
      snackbar.success(`${label} deleted`);
      onDeleteSuccess?.(data);
    },
    onError: (error) => {
      snackbar.error(error, `Failed to delete ${label.toLowerCase()}`);
    },
  });

  // Opened empty, whatever a cancelled one held
  const handleCreate = () => {
    createForm.reset(createDefaults);
    setCreateDialogOpen(true);
  };

  // Opened on the row's values, whatever the form held before
  const handleEdit = (item: TData, values: TFormData) => {
    editForm.reset(values);
    editDialog.openWith(item);
  };

  const handleDelete = (itemId: string) => deleteDialog.openWith(itemId);

  return {
    data,
    isLoading,
    error,

    createDialogOpen,
    setCreateDialogOpen,
    /** A row's edit dialog: `open`, `close`, and the row it edits (`target`). */
    editDialog,
    /** A row's delete dialog: `open`, `close`, and the id it deletes (`target`). */
    deleteDialog,

    createForm,
    editForm,

    createMutation,
    updateMutation,
    deleteMutation,

    handleCreate,
    handleEdit,
    handleDelete,

    /**
     * The dialogs' wiring: `<CreateDialog {...createDialogProps} title="…">`, `<EditDialog {...editDialogProps} …>`,
     * `<DeleteDialog {...deleteDialogProps} …>`. A section that sends something else than its form's values (a
     * requirement's level, a duplicate's source) overrides `onSubmit` after the spread.
     */
    createDialogProps: {
      open: createDialogOpen,
      onClose: () => setCreateDialogOpen(false),
      form: createForm,
      onSubmit: (data: TFormData) => createMutation.mutate(data),
      isLoading: createMutation.isPending,
    },
    editDialogProps: {
      open: editDialog.open,
      onClose: editDialog.close,
      form: editForm,
      // Under the row's token, as its dialog opened on it
      onSubmit: (data: TFormData) => {
        if (editDialog.target)
          updateMutation.mutate({ id: editDialog.target.id, data, updatedAt: editDialog.target.updatedAt });
      },
      isLoading: updateMutation.isPending,
    },
    deleteDialogProps: {
      open: deleteDialog.open,
      onClose: deleteDialog.close,
      onConfirm: () => {
        if (deleteDialog.target) deleteMutation.mutate(deleteDialog.target);
      },
      isLoading: deleteMutation.isPending,
    },
  };
}
