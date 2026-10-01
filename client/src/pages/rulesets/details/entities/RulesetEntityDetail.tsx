import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { type QueryKey, useMutation, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { type DefaultValues, type FieldValues, useForm, type UseFormReturn } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";

import { DeleteDialog } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useFormSync, usePageTitle } from "@/client/src/hooks/index.ts";
import { rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { isStillOpen } from "@/client/src/lib/stillOpen.ts";
import { EntityDetailLayout, EntityDetailsCard, EntityPageError } from "@/client/src/pages/rulesets/components/index.ts";
import { entityPageState, useRulesetPermissions } from "@/client/src/pages/rulesets/hooks/index.ts";

interface EntityBase {
  id: string;
  name: string;
  description?: string | null;
  updatedAt: string;
}

interface EntityEditing<TEntity, TForm extends FieldValues> {
  toFormValues: (entity: TEntity) => TForm;
  /** Saves the form; resolves to the saved entity, whose id changes when a fork copies an inherited one. */
  update: (data: TForm, updatedAt: string | undefined) => Promise<TEntity>;
  remove: () => Promise<unknown>;
  renderFields: (form: UseFormReturn<TForm>) => ReactNode;
}

interface RulesetEntityDetailProps<TEntity extends EntityBase, TForm extends FieldValues, TKey extends QueryKey> {
  rulesetId: string;
  entityId: string;
  /** Ruleset tab and URL segment, e.g. "languages". */
  section: string;
  /** Singular display name, e.g. "Language". */
  label: string;
  /** The entity's detail query by id, from `entityDetailQueries.ts`: the page reads it, and a save seeds the copy's. */
  query: (entityId: string) => UseQueryOptions<TEntity, Error, TEntity, TKey>;
  /** Omitted for entities that can't be edited (abilities). */
  editing?: EntityEditing<TEntity, TForm>;
  /** Facts shown next to the title in the read-only view. */
  renderChips?: (entity: TEntity) => ReactNode;
}

/**
 * Page body shared by the simple ruleset entities (languages, skills, saves,
 * mechanics, aptitudes, abilities): an edit form for editors, the description
 * for everyone else.
 */
export function RulesetEntityDetail<TEntity extends EntityBase, TForm extends FieldValues, TKey extends QueryKey>({
  rulesetId,
  entityId,
  section,
  label,
  query,
  editing,
  renderChips,
}: RulesetEntityDetailProps<TEntity, TForm, TKey>) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const backUrl = entityPageState(location.state).from ?? `/rulesets/${rulesetId}/${section}`;
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: ruleset, isLoading: isRulesetLoading, error: rulesetError } = useQuery(rulesetDetailQuery(rulesetId));
  const { data: entity, isLoading: isEntityLoading, error: entityError } = useQuery(query(entityId));

  usePageTitle(entity?.name);

  const { canEditEntities } = useRulesetPermissions(ruleset);
  const canEdit = !!editing && canEditEntities;

  const form = useForm<TForm>({ defaultValues: {} as DefaultValues<TForm> });
  const sync = useFormSync(form, entity && editing ? editing.toFormValues(entity) : undefined, {
    // An inherited entity keeps its id in every fork.
    key: `${rulesetId}/${entityId}`,
    updatedAt: entity?.updatedAt,
  });

  const invalidateSection = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(rulesetId, section) });

  const saveMutation = useMutation({
    mutationFn: async (data: TForm) => {
      if (!editing) throw new Error(`${label} can't be edited`);
      const saved = await editing.update(data, sync.updatedAt());
      return { sourceId: entityId, saved, values: editing.toFormValues(saved) };
    },
    onSuccess: ({ saved, sourceId, values }) => {
      sync.saved(values, saved.updatedAt);
      const savedKey = query(saved.id).queryKey;
      queryClient.setQueryData<TEntity>(savedKey, saved);
      // Supersede any refetch that left before the save committed.
      void queryClient.invalidateQueries({ queryKey: savedKey, exact: true });
      // Editing an inherited entity copies it into this ruleset under a new id:
      // follow it, unless the page has left that entity since.
      if (isStillOpen(`/rulesets/${rulesetId}/${section}/${sourceId}`) && saved.id !== sourceId) {
        navigate(`/rulesets/${rulesetId}/${section}/${saved.id}`, { replace: true, state: location.state });
      }
      void invalidateSection();
      snackbar.success(`${label} updated`);
    },
    onError: (err) => snackbar.error(err, `Failed to update ${label.toLowerCase()}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => (editing ? editing.remove() : Promise.reject(new Error(`${label} can't be deleted`))),
    onSuccess: () => {
      void invalidateSection();
      snackbar.success(`${label} deleted`);
      navigate(backUrl);
    },
    onError: (err) => snackbar.error(err, `Failed to delete ${label.toLowerCase()}`),
  });

  if (!isRulesetLoading && !isEntityLoading && (!ruleset || !entity)) {
    return (
      <EntityPageError
        message={!ruleset ? loadFailureMessage("Ruleset", rulesetError) : loadFailureMessage(label, entityError)}
        backLabel="Back"
        onBack={() => navigate(backUrl)}
      />
    );
  }

  return (
    <>
      <EntityDetailLayout
        entityName={entity?.name}
        rulesetName={ruleset?.name}
        onBack={() => navigate(backUrl)}
        canDelete={canEdit}
        onDelete={() => setDeleteDialogOpen(true)}
        isLoading={isRulesetLoading || isEntityLoading}
      >
        {entity && (
          <EntityDetailsCard
            title={`${label} Details`}
            chips={renderChips?.(entity)}
            description={entity.description}
            edit={canEdit ? {
              fields: editing.renderFields(form),
              onSubmit: sync.handleSubmit((data) => saveMutation.mutate(data)),
              canSave: form.formState.isDirty,
              isSaving: saveMutation.isPending,
            } : undefined}
          />
        )}
      </EntityDetailLayout>
      {editing && (
        <DeleteDialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          title={`Delete ${label}`}
          message={`Are you sure you want to delete this ${label.toLowerCase()}? This action cannot be undone.`}
          onConfirm={() => deleteMutation.mutate()}
          isLoading={deleteMutation.isPending}
        />
      )}
    </>
  );
}
