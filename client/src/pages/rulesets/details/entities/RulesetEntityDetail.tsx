import { type QueryKey, useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { type ReactNode } from "react";
import type { DefaultValues, FieldValues, UseFormReturn } from "react-hook-form";
import { Navigate, useLocation } from "react-router-dom";

import { useFormSync, useFormWith, usePageTitle, useRulesetPermissions } from "@/client/src/hooks/index.ts";
import { loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { rulesetDetailQuery } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import {
  EntityDetailLayout,
  EntityDetailsCard,
  EntityPageError,
} from "@/client/src/pages/rulesets/components/index.ts";
import { entityPageBack } from "@/client/src/pages/rulesets/entityPageState.ts";
import { useCopyOnWrite, useEntitySave, useRestorableDelete } from "@/client/src/pages/rulesets/hooks/index.ts";

type EditableDetailsProps<TEntity extends EntityBase, TForm extends FieldValues, TKey extends QueryKey> = Pick<
  RulesetEntityDetailProps<TEntity, TForm, TKey>,
  "rulesetId" | "entityId" | "section" | "label" | "query"
> & {
  chips: ReactNode;
  editing: EntityEditing<TEntity, TForm>;
  entity: TEntity;
};

interface EntityBase {
  description?: string | null;
  id: string;
  name: string;
  /** The ruleset that holds it: the page's, or one it inherits from */
  rulesetId: string;
  updatedAt: string;
}

interface EntityEditing<TEntity, TForm extends FieldValues> {
  /** The form before its entity's values fill it in */
  empty: TForm & DefaultValues<TForm>;
  /** Deletes the entity: the delete mutation's request. */
  removeFn: () => Promise<unknown>;
  renderFields: (form: UseFormReturn<TForm>) => ReactNode;
  toFormValues: (entity: TEntity) => TForm;
  /**
   * Saves the form, the save mutation's request; resolves to the saved entity, whose id changes when a fork copies an
   * inherited one.
   */
  updateFn: (data: TForm, updatedAt: string | undefined) => Promise<TEntity>;
}

interface RulesetEntityDetailProps<TEntity extends EntityBase, TForm extends FieldValues, TKey extends QueryKey> {
  /** Omitted for entities that can't be edited (abilities). */
  editing?: EntityEditing<TEntity, TForm>;
  entityId: string;
  /** Singular display name, e.g. "Language". */
  label: string;
  /** What failed to load for the read-only view, stated above its description */
  notice?: ReactNode;
  /** The entity's detail query by id, from `entityDetailQueries.ts`: the page reads it, and a save seeds the copy's. */
  query: (entityId: string) => UseQueryOptions<TEntity, Error, TEntity, TKey>;
  /** Facts shown next to the title in the read-only view. */
  renderChips?: (entity: TEntity) => ReactNode;
  rulesetId: string;
  /** Ruleset tab and URL segment, e.g. "languages". */
  section: string;
}

/** An editor's details: the entity's form, following the entity, which saves it. */
function EditableDetails<TEntity extends EntityBase, TForm extends FieldValues, TKey extends QueryKey>({
  rulesetId,
  entityId,
  section,
  label,
  query,
  editing,
  entity,
  chips,
}: EditableDetailsProps<TEntity, TForm, TKey>) {
  const queryClient = useQueryClient();

  const copy = useCopyOnWrite(rulesetId, entityId, (id) => `${section}/${id}`);
  const form = useFormWith<TForm>(editing.empty);
  const sync = useFormSync(form, editing.toFormValues(entity), {
    key: copy.key,
    adoptKey: copy.adoptKey,
    updatedAt: entity.updatedAt,
  });
  // The copy's data is in as the page moves to it: the save seeds it
  const forgetSource = copy.forgetSource(true);

  const saveMutation = useEntitySave({
    rulesetId,
    entityId,
    label,
    listKey: QUERY_KEYS.rulesets.section(rulesetId, section),
    sync,
    saveFn: editing.updateFn,
    toFormValues: editing.toFormValues,
    // The save's response is the whole entity: the copy's page shows it at once
    storeSaved: (saved) => {
      const savedKey = query(saved.id).queryKey;
      queryClient.setQueryData<TEntity>(savedKey, saved);
      // Supersede any refetch that left before the save committed.
      void queryClient.invalidateQueries({ queryKey: savedKey, exact: true });
    },
    followCopy: copy.followCopy,
  });

  return (
    <>
      {forgetSource && <Navigate to={forgetSource.to} replace state={forgetSource.state} />}
      <EntityDetailsCard
        title={`${label} Details`}
        chips={chips}
        description={entity.description}
        edit={{
          fields: editing.renderFields(form),
          onSubmit: sync.handleSubmit((data) => saveMutation.mutate(data)),
          canSave: sync.isDirty,
          isSaving: saveMutation.isPending,
        }}
      />
    </>
  );
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
  notice,
  renderChips,
}: RulesetEntityDetailProps<TEntity, TForm, TKey>) {
  const location = useLocation();
  const back = entityPageBack(location.state, `/rulesets/${rulesetId}/${section}`);

  const { data: ruleset, isLoading: isRulesetLoading, error: rulesetError } = useQuery(rulesetDetailQuery(rulesetId));
  const { data: entity, isLoading: isEntityLoading, error: entityError } = useQuery(query(entityId));

  usePageTitle(entity?.name);

  const { canEditEntities } = useRulesetPermissions(ruleset);
  const canEdit = !!editing && canEditEntities;
  // Deleting an inherited entity can be undone
  const { restorable, error: changesError } = useRestorableDelete(ruleset, entity);

  if (!isRulesetLoading && !isEntityLoading && (!ruleset || !entity)) {
    return (
      <EntityPageError
        message={!ruleset ? loadFailureMessage("Ruleset", rulesetError) : loadFailureMessage(label, entityError)}
        backLabel={back.label}
        backTo={back.to}
      />
    );
  }

  return (
    <EntityDetailLayout
      entityName={entity?.name}
      rulesetName={ruleset?.name}
      what={label}
      backTo={back.to}
      deletion={
        editing && canEdit
          ? {
              rulesetId,
              deleteFn: editing.removeFn,
              listKeys: [QUERY_KEYS.rulesets.section(rulesetId, section)],
              entityKey: query(entityId).queryKey,
              restorable,
              changesError,
            }
          : undefined
      }
      isLoading={isRulesetLoading || isEntityLoading}
    >
      {entity &&
        (canEdit ? (
          <EditableDetails
            rulesetId={rulesetId}
            entityId={entityId}
            section={section}
            label={label}
            query={query}
            editing={editing}
            entity={entity}
            chips={renderChips?.(entity)}
          />
        ) : (
          <EntityDetailsCard
            title={`${label} Details`}
            chips={renderChips?.(entity)}
            notice={notice}
            description={entity.description}
          />
        ))}
    </EntityDetailLayout>
  );
}
