import { Stack } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { BlankNote, ConfirmDialog } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState, useRules } from "@/client/src/hooks/index.ts";
import { type CharacterDetail, characterDetailQuery, invalidateCharacter } from "@/client/src/lib/queries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { AbilityScoreBox } from "./AbilityScoreBox.tsx";
import { SCORE_ROW_GAP, SCORE_ROW_SX, SCORE_SLOT_SX } from "./scoreRow.ts";
import { SheetSection } from "./SheetSection.tsx";
import { useSuppressedWarningsStore } from "./suppressedWarningsStore.ts";

interface AbilityScoresSectionProps {
  /** The character's abilities, in the order its sheet lists them. */
  abilities: CharacterDetail["abilities"];
  /** The character's base rules, which bound an ability's base */
  baseRules: BaseRules;
  characterId: string;
  readOnly?: boolean;
}

export function AbilityScoresSection({ abilities, baseRules, characterId, readOnly }: AbilityScoresSectionProps) {
  const bounds = useRules(baseRules).rules?.abilityScores;
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const queryKey = characterDetailQuery(characterId).queryKey;

  const updateMutation = useMutation({
    mutationFn: async ({ abilityId, score }: { abilityId: string; score: number }) =>
      parseResponse(
        rpc.api.characters[":id"].abilities.$put({
          param: { id: characterId },
          json: { [abilityId]: score },
        }),
      ),
    onMutate: async ({ abilityId, score }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old) => {
        if (!old) return old;
        // Until the server answers: the total moves by the base's change, whatever else adds to it, and the modifier
        // stays the one it gave
        const abilities = old.abilities.map((data) =>
          data.abilityId === abilityId ? { ...data, base: score, total: data.total + score - data.base } : data,
        );
        return { ...old, abilities };
      });

      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);

      snackbar.error(error, "Failed to update ability score");
    },
    onSettled: () => invalidateCharacter(queryClient, characterId),
  });

  const decreaseDialog = useDialogState<{ abilityId: string; score: number }>();
  const shouldWarn = useSuppressedWarningsStore((s) => s.shouldWarn);
  const suppressWarningForSession = useSuppressedWarningsStore((s) => s.suppressWarningForSession);

  // A lower base asks first, unless its warning is off for the session
  const handleBaseChange = ({ abilityId, base }: CharacterDetail["abilities"][number], score: number) => {
    if (score > base || !shouldWarn("abilityDecrease")) updateMutation.mutate({ abilityId, score });
    else decreaseDialog.openWith({ abilityId, score });
  };

  return (
    <SheetSection title="Ability Scores">
      {abilities.length > 0 ? (
        <Stack direction="row" spacing={SCORE_ROW_GAP} sx={SCORE_ROW_SX}>
          {abilities.map((abilityData) => (
            <AbilityScoreBox
              key={abilityData.abilityId}
              sx={SCORE_SLOT_SX}
              ability={abilityData}
              bounds={bounds}
              onBaseChange={handleBaseChange}
              readOnly={readOnly}
            />
          ))}
        </Stack>
      ) : (
        <BlankNote>No ability scores</BlankNote>
      )}
      <ConfirmDialog
        open={decreaseDialog.open}
        onClose={decreaseDialog.close}
        title="Decrease Ability Score"
        message="Are you sure you want to decrease this ability score? It may break the prerequisites of what the character took."
        confirmLabel="Decrease Ability Score"
        onConfirm={() => {
          if (!decreaseDialog.target) return;
          updateMutation.mutate(decreaseDialog.target, {
            onSuccess: () => {
              decreaseDialog.close();
              suppressWarningForSession("abilityDecrease");
            },
          });
        }}
        pending={updateMutation.isPending}
      />
    </SheetSection>
  );
}
