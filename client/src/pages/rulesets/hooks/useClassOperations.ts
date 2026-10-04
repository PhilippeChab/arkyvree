import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { useDebouncedValue, useListboxQuery } from "@/client/src/hooks/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import type { CreateLevelFormData } from "@/client/src/pages/rulesets/components/forms/dnd3.5/index.ts";
import { classLevelsQuery, classSkillsQuery } from "@/client/src/pages/rulesets/details/classes/classSectionQueries.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";

type LevelsArray = InferResponseType<(typeof rpc.api.rulesets)[":id"]["classes"][":classId"]["levels"]["$get"], 200>;
export type Level = LevelsArray[number];

export function useClassLevels(rulesetId: string, classId: string) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const createForm = useForm<CreateLevelFormData>({
    defaultValues: {
      level: 1,
      bab: 0,
      skills: 1,
      saves: [],
      feats: [],
    },
  });

  const { data: levels, isLoading } = useQuery({
    ...classLevelsQuery(rulesetId, classId),
    enabled: !!rulesetId && !!classId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateLevelFormData) => {
      return parseResponse(
        rpc.api.rulesets[":id"].classes[":classId"].levels.$post({
          param: { id: rulesetId, classId },
          json: data,
        }),
      );
    },
    onSuccess: () => {
      snackbar.success("Level created successfully");
      queryClient.invalidateQueries({
        queryKey: classLevelsQuery(rulesetId, classId).queryKey,
      });
      setCreateDialogOpen(false);
      createForm.reset();
    },
    onError: (error) => {
      snackbar.error(error, "Failed to create level");
    },
  });

  // Compute highest level for defaults
  const highestLevel = levels?.slice().sort((a, b) => b.level - a.level)[0] ?? null;

  const handleCreate = () => {
    createForm.reset({
      level: highestLevel ? highestLevel.level + 1 : 1,
      bab: highestLevel?.bab ?? 0,
      skills: highestLevel?.skills ?? 1,
      saves: highestLevel?.saves?.map((s) => ({ saveId: s.saveId, base: s.base })) ?? [],
      feats: [],
    });
    setCreateDialogOpen(true);
  };

  const confirmCreate = (data: CreateLevelFormData) => {
    createMutation.mutate(data);
  };

  return {
    levels,
    isLoading,

    createDialogOpen,
    setCreateDialogOpen,

    highestLevel,

    createForm,

    createMutation,

    handleCreate,
    confirmCreate,
  };
}

export function useClassSkills(rulesetId: string, classId: string) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [skillToRemove, setSkillToRemove] = useState<string | null>(null);

  const skillsQuery = classSkillsQuery(rulesetId, classId);
  const classSkillsKey = skillsQuery.queryKey;
  const { data: classSkills, isLoading } = useQuery({ ...skillsQuery, enabled: !!rulesetId && !!classId });

  // Available skills with server-side search and pagination
  const [skillSearch, setSkillSearch] = useState("");
  const debouncedSkillSearch = useDebouncedValue(skillSearch);

  const {
    items: availableSkills,
    isLoading: isAvailableSkillsLoading,
    onScroll: handleSkillsScroll,
  } = useListboxQuery({
    queryKey: queryKeys.rulesets.sectionSearch(rulesetId, "skills", debouncedSkillSearch),
    queryFn: async ({ pageParam }) => {
      return parseResponse(
        rpc.api.rulesets[":id"].skills.$get({
          param: { id: rulesetId },
          query: {
            limit: "20",
            page: pageParam.toString(),
            search: debouncedSkillSearch || undefined,
          },
        }),
      );
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.nextPage,
    enabled: !!rulesetId,
  });

  const addSkillMutation = useMutation({
    mutationFn: async (skillId: string) => {
      return parseResponse(
        rpc.api.rulesets[":id"].classes[":classId"].skills.$post({
          param: { id: rulesetId, classId },
          json: { skillId },
        }),
      );
    },
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
      snackbar.success("Skill added to class successfully");
    },
    onError: (err, _skillId, context) => {
      snackbar.error(err, "Failed to add skill to class");
      // If the mutation fails, use the context returned from onMutate to roll back
      queryClient.setQueryData(classSkillsKey, context?.previousClassSkills);
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we have the latest data
      queryClient.invalidateQueries({
        queryKey: classSkillsKey,
      });
    },
  });

  const removeSkillMutation = useMutation({
    mutationFn: async (skillId: string) => {
      return parseResponse(
        rpc.api.rulesets[":id"].classes[":classId"].skills[":skillId"].$delete({
          param: { id: rulesetId, classId, skillId },
        }),
      );
    },
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
      snackbar.success("Skill removed from class successfully");
    },
    onError: (err, _skillId, context) => {
      snackbar.error(err, "Failed to remove skill from class");
      // If the mutation fails, use the context returned from onMutate to roll back
      queryClient.setQueryData(classSkillsKey, context?.previousClassSkills);
    },
    onSettled: () => {
      // Always refetch after error or success to ensure we have the latest data
      queryClient.invalidateQueries({
        queryKey: classSkillsKey,
      });
      setDeleteDialogOpen(false);
      setSkillToRemove(null);
    },
  });

  const handleAddSkill = (skillId: string) => {
    addSkillMutation.mutate(skillId);
  };

  const handleRemoveSkill = (skillId: string) => {
    setSkillToRemove(skillId);
    setDeleteDialogOpen(true);
  };

  const confirmRemoveSkill = () => {
    if (skillToRemove) {
      removeSkillMutation.mutate(skillToRemove);
    }
  };

  return {
    classSkills,
    availableSkills,
    isLoading,
    isAvailableSkillsLoading,

    setSkillSearch,
    handleSkillsScroll,

    deleteDialogOpen,
    setDeleteDialogOpen,

    addSkillMutation,
    removeSkillMutation,

    handleAddSkill,
    handleRemoveSkill,
    confirmRemoveSkill,
  };
}
