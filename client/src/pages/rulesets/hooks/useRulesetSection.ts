import {
  type DefaultError,
  type QueryKey,
  useMutation,
  useQueries,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { type DefaultValues, type FieldValues } from "react-hook-form";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useFormWith } from "@/client/src/hooks/index.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";

type RulesetSectionConfig<
  TData,
  TFormData extends FieldValues,
  TCreated extends { id: string },
  TUpdated,
  TDeleted,
  TKey extends QueryKey,
> = SectionRows<TData, TKey> & {
  /** Every field's value in an empty form: the create form's, and the edit form's until a row's values replace them */
  createDefaults: TFormData & DefaultValues<TFormData>;
  /** Resolves to the created entity, which is handed to `onCreateSuccess`. */
  createFn: (data: TFormData) => Promise<TCreated>;
  /** Its rows, handed over: its query stays idle */
  data?: TData[];
  deleteFn?: (id: string) => Promise<TDeleted>;
  /** Copies a row (`handleDuplicate`): its id and the create form's values; resolves to the copy, as a create does. */
  duplicateFn?: (sourceId: string, data: TFormData) => Promise<TCreated>;
  label: string;
  /** After a create or a duplicate */
  onCreateSuccess?: (created: TCreated) => void;
  onDeleteSuccess?: (data: TDeleted) => void;
  onUpdateSuccess?: (data: TUpdated) => void;
  queryKeysToInvalidate?: readonly (readonly unknown[])[];
  rulesetId: string;
  /** Saves a row's edit, `updatedAt` its stale-edit token: the row's, as its edit dialog opened on it. */
  updateFn?: (id: string, data: TFormData, updatedAt: string | undefined) => Promise<TUpdated>;
};

/** Where a section's rows are cached, which its saves refresh */
type SectionRows<TData, TKey extends QueryKey> =
  /** Its own rows, a factory's options (`modifiersQuery(…)`, `classLevelsQuery(…)`), read unless `data` holds them */
  | { query: UseQueryOptions<TData[], DefaultError, TData[], TKey>; sectionName?: undefined }
  /** A section that reads its rows itself (a paged list): the section they're cached under (`"feats"`) */
  | { query?: undefined; sectionName: string };

export function useRulesetSection<
  TData extends { id: string; updatedAt?: string },
  TFormData extends FieldValues,
  TCreated extends { id: string } = { id: string },
  TUpdated = unknown,
  TDeleted = unknown,
  TKey extends QueryKey = QueryKey,
>(config: RulesetSectionConfig<TData, TFormData, TCreated, TUpdated, TDeleted, TKey>) {
  const {
    rulesetId,
    label,
    data: externalData,
    queryKeysToInvalidate,
    createFn,
    duplicateFn,
    updateFn,
    deleteFn,
    onCreateSuccess,
    onUpdateSuccess,
    onDeleteSuccess,
    createDefaults,
  } = config;
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  // The create dialog opens empty (`true`) or on the row it duplicates; a row's edit and delete dialogs on it. Each
  // keeps what it shows while it fades out.
  const createDialog = useDialogState<TData | true>();
  const editDialog = useDialogState<TData>();
  const deleteDialog = useDialogState<string>();
  const duplicateSource = createDialog.target === true ? null : createDialog.target;

  const createForm = useFormWith<TFormData>(createDefaults);
  const editForm = useFormWith<TFormData>(createDefaults);

  // A section handed its rows, or with none of its own to read, reads no query
  const rowsQueries: UseQueryOptions<TData[], DefaultError, TData[], TKey>[] =
    config.query && !externalData ? [config.query] : [];
  const [rows] = useQueries({ queries: rowsQueries });

  const data = externalData ?? rows?.data;
  const rowsKey = config.query ? config.query.queryKey : QUERY_KEYS.rulesets.section(rulesetId, config.sectionName);

  const invalidateOnMutation = () =>
    invalidateRulesetEdit(queryClient, rulesetId, [rowsKey, ...(queryKeysToInvalidate ?? [])]);

  const createMutation = useMutation({
    // A duplicate's source is fixed as it's sent
    mutationFn: ({ data, sourceId }: { data: TFormData; sourceId?: string }) => {
      if (sourceId === undefined) return createFn(data);
      return duplicateFn ? duplicateFn(sourceId, data) : Promise.reject(new Error(`${label} can't be duplicated here`));
    },
    onSuccess: (created) => {
      snackbar.success(`${label} created`);
      invalidateOnMutation();
      createDialog.close();
      onCreateSuccess?.(created);
    },
    onError: (error, { sourceId }) => {
      snackbar.error(error, `Failed to ${sourceId === undefined ? "create" : "duplicate"} ${label.toLowerCase()}`);
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
    createDialog.openWith(true);
  };

  // Opened on the row's values, which its save sends with the row's id; they differ from the empty form's, so a stray
  // click never loses them
  const handleDuplicate = (item: TData, values: TFormData) => {
    createForm.reset(values, { keepDefaultValues: true });
    createDialog.openWith(item);
  };

  // Opened on the row's values, whatever the form held before
  const handleEdit = (item: TData, values: TFormData) => {
    editForm.reset(values);
    editDialog.openWith(item);
  };

  const handleDelete = (itemId: string) => deleteDialog.openWith(itemId);

  return {
    data,
    isLoading: rows?.isLoading ?? false,
    error: rows?.error ?? null,

    /** The row the create dialog duplicates, while it's open on one (`handleDuplicate`) */
    duplicateSource,
    /** A row's edit dialog: `open`, `close`, and the row it edits (`target`). */
    editDialog,

    createForm,
    editForm,

    createMutation,
    updateMutation,

    handleCreate,
    handleDuplicate,
    handleEdit,
    handleDelete,

    /**
     * The dialogs' wiring: `<CreateDialog {...createDialogProps} title="…">`, `<EditDialog {...editDialogProps} …>`,
     * `<EntityDeleteDialog {...deleteDialogProps} …>`. A section that sends something else than its form's values (a
     * requirement's level) overrides `onSubmit` after the spread.
     */
    createDialogProps: {
      open: createDialog.open,
      onClose: createDialog.close,
      form: createForm,
      onSubmit: (data: TFormData) => createMutation.mutate({ data, sourceId: duplicateSource?.id }),
      pending: createMutation.isPending,
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
      pending: updateMutation.isPending,
    },
    deleteDialogProps: {
      open: deleteDialog.open,
      onClose: deleteDialog.close,
      onConfirm: () => {
        if (deleteDialog.target) deleteMutation.mutate(deleteDialog.target);
      },
      pending: deleteMutation.isPending,
    },
  };
}
