import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useForm, type DefaultValues, type FieldValues, type UseFormReturn } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";

import { DeleteDialog } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useFormSync, usePageTitle } from "@/client/src/hooks/index.ts";
import { rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { EntityDetailLayout, EntityDetailsCard } from "@/client/src/pages/rulesets/components/index.ts";
import { useRulesetPermissions } from "@/client/src/pages/rulesets/hooks/index.ts";

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

interface RulesetEntityDetailProps<TEntity extends EntityBase, TForm extends FieldValues> {
  rulesetId: string;
  entityId: string;
  /** Ruleset tab and URL segment, e.g. "languages". */
  section: string;
  /** Singular display name, e.g. "Language". */
  label: string;
  fetchEntity: () => Promise<TEntity>;
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
export function RulesetEntityDetail<TEntity extends EntityBase, TForm extends FieldValues>({
  rulesetId,
  entityId,
  section,
  label,
  fetchEntity,
  editing,
  renderChips,
}: RulesetEntityDetailProps<TEntity, TForm>) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const backUrl = (location.state as { from?: string } | null)?.from ?? `/rulesets/${rulesetId}/${section}`;
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const { data: ruleset, isLoading: isRulesetLoading } = useQuery(rulesetDetailQuery(rulesetId));
  const entityKey = queryKeys.rulesets.entity(rulesetId, section, entityId);
  const { data: entity, isLoading: isEntityLoading } = useQuery({ queryKey: entityKey, queryFn: fetchEntity });

  usePageTitle(entity?.name);

  const { canEditEntities } = useRulesetPermissions(ruleset);
  const canEdit = !!editing && canEditEntities;

  const form = useForm<TForm>({ defaultValues: {} as DefaultValues<TForm> });
  const sync = useFormSync(form, entity && editing ? editing.toFormValues(entity) : undefined, {
    key: entityId,
    updatedAt: entity?.updatedAt,
  });

  const invalidateSection = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.rulesets.section(rulesetId, section) });

  const saveMutation = useMutation({
    mutationFn: (data: TForm) => editing!.update(data, sync.updatedAt()),
    onSuccess: (saved) => {
      sync.saved(editing!.toFormValues(saved), saved.updatedAt);
      queryClient.setQueryData(queryKeys.rulesets.entity(rulesetId, section, saved.id), saved);
      // Editing an inherited entity copies it into this ruleset under a new id.
      if (saved.id !== entityId) {
        navigate(`/rulesets/${rulesetId}/${section}/${saved.id}`, { replace: true, state: location.state });
      }
      void invalidateSection();
      snackbar.success(`${label} updated`);
    },
    onError: (err) => snackbar.error(err, `Failed to update ${label.toLowerCase()}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => editing!.remove(),
    onSuccess: () => {
      void invalidateSection();
      snackbar.success(`${label} deleted`);
      navigate(backUrl);
    },
    onError: (err) => snackbar.error(err, `Failed to delete ${label.toLowerCase()}`),
  });

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
              onSubmit: form.handleSubmit((data) => saveMutation.mutate(data)),
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
