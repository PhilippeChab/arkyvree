import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useCustomizationPages, useDialogState, useFormWith } from "@/client/src/hooks/index.ts";
import type { EntityRow } from "@/client/src/lib/entityRequests.ts";
import type { ProgressionCounts } from "@/client/src/lib/queries.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { customizationEntityQuery } from "@/client/src/pages/rulesets/customization/entityQueries.ts";
import type { ListedFormData, ListedWords } from "@/client/src/pages/rulesets/details/owners/components/index.ts";
import { type OwnerList, ownerParam } from "@/client/src/pages/rulesets/details/owners/ownerSectionQueries.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

/**
 * An add to a list, as its dialog sends it: the list, as the tab read it (its id none for the owner's own list, which
 * the add makes), and what its form holds.
 */
interface ListAdd extends ListedFormData {
  list: AddedList;
}

/**
 * A removal from a list: the list, as the tab read it, the entity it removes, its row, and whether Local Changes can
 * restore it (`restorable`, its page's `restorableDelete`, which the server answers).
 */
interface ListRemoval {
  entity: EntityRow;
  list: OwnerList;
  restorable: boolean;
}

/** A list an add is to: one of the owner's (`OwnerList`), or its own, which the add makes (its id none). */
type AddedList = Pick<OwnerList, "name"> & { id: string | null };

/** An owner's lists' routes: its own list's add, and one list's. */
const listsApi = rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].lists;
const listApi = listsApi[":listId"];

/**
 * The adds to and removals from an owner's lists (`ownerType`'s, `ownerId`: 3.5's class's spell lists, its table of
 * them its rules' `counts.lists`, each of the kind `listKind`: 3.5's aptitudes), of the entities of a kind (`type`, its
 * rules' `counts.type`), said in its rules' words (`words`): its add's dialog and form, opened on a list at a tier
 * (`openAdd`), which tells the tab the tier it added at once it's saved (`onAdded`), its removal's confirmation, opened
 * on a row once the entity's page says whether Local Changes can restore it (`openRemove`: its `restorableDelete`,
 * which the row's hover warms), and their requests. An add to the owner's own list (its id none) goes through its own
 * list's route, which makes it. Each refreshes the kind's lists and pickers, the pages of the entities it wrote (an
 * inherited one's, by the id the tab read, and its copy's), the owner's lists and its progression, the lists' kind's
 * list and pickers (a list made), and the ruleset's Local Changes.
 */
export function useOwnerListEntries(
  rulesetId: string,
  ownerType: string,
  ownerId: string,
  { lists, type }: Pick<ProgressionCounts, "lists" | "type">,
  listKind: string | undefined,
  words: ListedWords,
  onAdded: (tier: number) => void,
) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const page = useCustomizationPages().get(type);
  const addDialog = useDialogState<AddedList>();
  const removeDialog = useDialogState<ListRemoval>();
  const form = useFormWith<ListedFormData>({ entities: [], tier: 0 });
  const [one, many] = [words.one.toLowerCase(), words.many.toLowerCase()];

  const { param } = ownerParam(rulesetId, ownerType, ownerId);
  const listParam = (listId: string) => ({ ...param, listId });
  const invalidate = (ids: readonly string[]) =>
    invalidateRulesetEdit(queryClient, rulesetId, [
      QUERY_KEYS.rulesets.section(rulesetId, type),
      QUERY_KEYS.rulesets.ownerTable(rulesetId, ownerId, lists),
      QUERY_KEYS.rulesets.ownerProgression(rulesetId, ownerId),
      ...(listKind ? [QUERY_KEYS.rulesets.section(rulesetId, listKind)] : []),
      ...ids.map((id) => QUERY_KEYS.rulesets.entity(rulesetId, type, id)),
    ]);

  const addMutation = useMutation({
    mutationFn: async ({ entities, list, tier }: ListAdd) => {
      const json = { targetIds: entities.map((entity) => entity.id), tier };
      if (list.id === null) return await parseResponse(listsApi.$post({ param, json }));
      return await parseResponse(listApi.$post({ param: listParam(list.id), json }));
    },
    onSuccess: (added, { list, tier }) => {
      snackbar.success(`${added.length} ${added.length === 1 ? one : many} added to ${list.name}`);
      addDialog.close();
      onAdded(tier);
    },
    onError: (error, { list }) => snackbar.error(error, `Failed to add ${many} to ${list.name}`),
    onSettled: (added, _error, { entities }) =>
      invalidate([...entities.map((entity) => entity.id), ...(added ?? []).map((entity) => entity.id)]),
  });

  const removeMutation = useMutation({
    mutationFn: ({ entity, list }: ListRemoval) =>
      parseResponse(listApi[":targetId"].$delete({ param: { ...listParam(list.id), targetId: entity.id } })),
    onSuccess: (_removed, { entity, list }) => {
      snackbar.success(`${entity.name} removed from ${list.name}`);
      removeDialog.close();
    },
    onError: (error, { entity, list }) => snackbar.error(error, `Failed to remove ${entity.name} from ${list.name}`),
    onSettled: (removed, _error, { entity }) => invalidate([entity.id, ...(removed ? [removed.id] : [])]),
  });

  /**
   * Opens the add on a list (`list`: the owner's own, its id none, makes it), its tier the one the tab shows (`tier`),
   * nothing picked yet.
   */
  const openAdd = (list: AddedList, tier: number) => {
    form.reset({ entities: [], tier });
    addDialog.openWith(list);
  };

  /**
   * Opens the removal of an entity (`entity`, a row) from a list (`list`) once its page says whether Local Changes can
   * restore it (`restorableDelete`: an inherited entity's, or the ruleset's copy of one).
   */
  const openRemove = (entity: EntityRow, list: OwnerList) =>
    void queryClient.fetchQuery(customizationEntityQuery(rulesetId, page, entity.id)).then(
      (read) => {
        const restorable = read.holder === "entity" && read.entity.restorableDelete;
        removeDialog.openWith({ entity, list, restorable });
      },
      (error) => snackbar.error(error, `Failed to remove ${entity.name} from ${list.name}`),
    );

  const handleAdd = (data: ListedFormData) => {
    if (addDialog.target) addMutation.mutate({ ...data, list: addDialog.target });
  };

  const confirmRemove = () => {
    if (removeDialog.target) removeMutation.mutate(removeDialog.target);
  };

  return {
    /** The add's dialog: `open`, `close`, `onExited`, and the list it adds to (`target`). */
    addDialog,
    addMutation,
    confirmRemove,
    form,
    handleAdd,
    openAdd,
    openRemove,
    /**
     * The removal's confirmation: `open`, `close`, and what it removes (`target`: the entity, its list, and whether
     * Local Changes can restore it).
     */
    removeDialog,
    removeMutation,
  };
}
