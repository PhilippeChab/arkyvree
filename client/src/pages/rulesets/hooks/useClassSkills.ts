import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useState } from "react";

import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDebouncedValue, useDialogState, useListboxQuery } from "@/client/src/hooks/index.ts";
import {
  classSkillsQuery,
  skillOptionsQuery,
} from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { invalidateRulesetEdit } from "@/client/src/pages/rulesets/details/sectionQueries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

export function useClassSkills(rulesetId: string, classId: string) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  // The skill a remove confirmation asks about, kept while it fades out
  const removeDialog = useDialogState<string>();

  const skillsQuery = classSkillsQuery(rulesetId, classId);
  const classSkillsKey = skillsQuery.queryKey;
  const { data: classSkills, isLoading, error } = useQuery(skillsQuery);

  // Available skills with server-side search and pagination
  const [skillSearch, setSkillSearch] = useState("");
  const debouncedSkillSearch = useDebouncedValue(skillSearch);

  const {
    items: availableSkills,
    isLoading: isAvailableSkillsLoading,
    error: availableSkillsError,
    onScroll: handleSkillsScroll,
  } = useListboxQuery(skillOptionsQuery(rulesetId, debouncedSkillSearch));

  const addSkillMutation = useMutation({
    mutationFn: async (skillId: string) =>
      parseResponse(
        rpc.api.rulesets[":id"].classes[":classId"].skills.$post({
          param: { id: rulesetId, classId },
          json: { skillId },
        }),
      ),
    onMutate: async (skillId: string) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({
        queryKey: classSkillsKey,
      });

      // Snapshot the previous value
      const previousClassSkills = queryClient.getQueryData(classSkillsKey);

      const skill = availableSkills.find((s) => s.id === skillId);

      if (skill) {
        // Optimistically update to the new value
        queryClient.setQueryData(classSkillsKey, (old) => {
          if (!old) return [];
          // A stand-in row until the refetch brings the real one.
          const now = new Date().toISOString();
          return [
            ...old,
            { skillId, klassId: classId, skillsInRule: skill, createdAt: now, updatedAt: now, deletedAt: null },
          ];
        });
      }

      // Return a context object with the snapshotted value
      return { previousClassSkills };
    },
    onSuccess: () => {
      snackbar.success("Skill added to class");
    },
    onError: (error, _skillId, context) => {
      snackbar.error(error, "Failed to add skill to class");
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousClassSkills) queryClient.setQueryData(classSkillsKey, context.previousClassSkills);
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we have the latest data
      invalidateRulesetEdit(queryClient, rulesetId, [classSkillsKey]);
    },
  });

  const removeSkillMutation = useMutation({
    mutationFn: async (skillId: string) =>
      parseResponse(
        rpc.api.rulesets[":id"].classes[":classId"].skills[":skillId"].$delete({
          param: { id: rulesetId, classId, skillId },
        }),
      ),
    onMutate: async (skillId: string) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await queryClient.cancelQueries({
        queryKey: classSkillsKey,
      });

      // Snapshot the previous value
      const previousClassSkills = queryClient.getQueryData(classSkillsKey);

      // Optimistically remove the skill
      queryClient.setQueryData(classSkillsKey, (old) => {
        if (!old) return [];
        return old.filter((cs) => cs.skillId !== skillId);
      });

      // Return a context object with the snapshotted value
      return { previousClassSkills };
    },
    onSuccess: () => {
      snackbar.success("Skill removed from class");
      removeDialog.close();
    },
    onError: (error, _skillId, context) => {
      snackbar.error(error, "Failed to remove skill from class");
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousClassSkills) queryClient.setQueryData(classSkillsKey, context.previousClassSkills);
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we have the latest data
      invalidateRulesetEdit(queryClient, rulesetId, [classSkillsKey]);
    },
  });

  const handleAddSkill = (skillId: string) => {
    addSkillMutation.mutate(skillId);
  };

  const handleRemoveSkill = (skillId: string) => removeDialog.openWith(skillId);

  const confirmRemoveSkill = () => {
    if (removeDialog.target) removeSkillMutation.mutate(removeDialog.target);
  };

  return {
    classSkills,
    availableSkills,
    isLoading,
    error,
    isAvailableSkillsLoading,
    availableSkillsError,

    setSkillSearch,
    handleSkillsScroll,

    /** The remove confirmation: `open`, `close`, and the skill it removes (`target`). */
    removeDialog,

    addSkillMutation,
    removeSkillMutation,

    handleAddSkill,
    handleRemoveSkill,
    confirmRemoveSkill,
  };
}
