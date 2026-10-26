import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useState } from "react";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDebouncedValue, useDialogState, useListboxQuery } from "@/client/src/hooks/index.ts";
import type { EntityLinksDescription } from "@/client/src/lib/queries.ts";
import { ownerLinksQuery, ownerParam } from "@/client/src/pages/rulesets/details/owners/ownerSectionQueries.ts";
import type { LinkWords } from "@/client/src/pages/rulesets/details/owners/ownerTab.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { entityOptionsQuery } from "@/client/src/pages/rulesets/optionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { useOwnerCopy } from "./useOwnerCopy.ts";

/**
 * An owner's links to the entities of a kind (`links`, its kind's role's: 3.5's class skills), which its links' tab
 * lists, adds to and removes from, each said in its rules' words (`words`). An add or a remove answers its link, from
 * the owner it was written on (`fromId`): the copy an edit of an inherited owner wrote it on.
 */
export function useOwnerLinks(
  rulesetId: string,
  ownerType: string,
  ownerId: string,
  links: EntityLinksDescription,
  words: LinkWords,
) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const one = words.one.toLowerCase();

  // The entity a remove confirmation asks about, kept while it fades out
  const removeDialog = useDialogState<string>();
  // Adding or removing a link of an inherited owner copies it: the page follows the copy (each request tagged with the
  // owner it was sent for), which takes the owner's place in the list
  const { followCopy, queryKeysToInvalidate, tag } = useOwnerCopy(rulesetId, ownerType, ownerId);

  const linksQuery = ownerLinksQuery(rulesetId, ownerType, ownerId, links.type);
  const linksKey = linksQuery.queryKey;
  const { data: linked, isLoading, error } = useQuery(linksQuery);

  // The kind's entities, searched on the server and paged in
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);

  const {
    items: options,
    isLoading: isOptionsLoading,
    error: optionsError,
    onScroll: handleOptionsScroll,
  } = useListboxQuery(entityOptionsQuery(rulesetId, links.type, debouncedSearch, { limit: 20 }));

  const addMutation = useMutation({
    mutationFn: async (targetId: string) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].links.$post({
            ...ownerParam(rulesetId, ownerType, ownerId),
            json: { targetId },
          }),
        ),
      ),
    onMutate: async (targetId: string) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({
        queryKey: linksKey,
      });

      // Snapshot the previous value
      const previousLinks = queryClient.getQueryData(linksKey);

      const option = options.find((entity) => entity.id === targetId);

      if (option) {
        // Optimistically update to the new value: a stand-in row, its entity the picked option, until the refetch
        // brings the real one
        queryClient.setQueryData(linksKey, (old) => {
          if (!old) return [];
          return [...old, { fromId: ownerId, toId: targetId, toName: option.name }];
        });
      }

      // Return a context object with the snapshotted value
      return { previousLinks };
    },
    onSuccess: (added) => {
      snackbar.success(`${words.one} added to ${words.owner}`);
      followCopy(added.fromId, added.sourceEntityId);
    },
    onError: (error, _targetId, context) => {
      snackbar.error(error, `Failed to add ${one} to ${words.owner}`);
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousLinks) queryClient.setQueryData(linksKey, context.previousLinks);
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we have the latest data
      void invalidateRulesetEdit(queryClient, rulesetId, [linksKey, ...queryKeysToInvalidate]);
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (targetId: string) =>
      tag(
        parseResponse(
          rpc.api.rulesets[":id"].entities[":entityType"][":entityId"].links[":targetId"].$delete({
            param: { ...ownerParam(rulesetId, ownerType, ownerId).param, targetId },
          }),
        ),
      ),
    onMutate: async (targetId: string) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({
        queryKey: linksKey,
      });

      // Snapshot the previous value
      const previousLinks = queryClient.getQueryData(linksKey);

      // Optimistically remove the link
      queryClient.setQueryData(linksKey, (old) => {
        if (!old) return [];
        return old.filter((link) => link.toId !== targetId);
      });

      // Return a context object with the snapshotted value
      return { previousLinks };
    },
    onSuccess: (removed) => {
      snackbar.success(`${words.one} removed from ${words.owner}`);
      removeDialog.close();
      followCopy(removed.fromId, removed.sourceEntityId);
    },
    onError: (error, _targetId, context) => {
      snackbar.error(error, `Failed to remove ${one} from ${words.owner}`);
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousLinks) queryClient.setQueryData(linksKey, context.previousLinks);
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we have the latest data
      void invalidateRulesetEdit(queryClient, rulesetId, [linksKey, ...queryKeysToInvalidate]);
    },
  });

  const handleRemove = (targetId: string) => removeDialog.openWith(targetId);

  const confirmRemove = () => {
    if (removeDialog.target) removeMutation.mutate(removeDialog.target);
  };

  return {
    linked,
    options,
    isLoading,
    error,
    isOptionsLoading,
    optionsError,

    setSearch,
    handleOptionsScroll,

    /** The remove confirmation: `open`, `close`, and the entity it removes (`target`). */
    removeDialog,

    addMutation,
    removeMutation,

    handleRemove,
    confirmRemove,
  };
}
