import { Box, Stack } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { sortAbilities } from "@/client/src/components/characters/sections/abilityOrder.ts";
import { SheetSection } from "@/client/src/components/characters/sections/SheetSection.tsx";
import { BlankNote, ConfirmDialog } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState } from "@/client/src/hooks/index.ts";
import { type CharacterDetail, characterDetailQuery, invalidateCharacter } from "@/client/src/lib/queries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { useSuppressedWarningsStore } from "@/client/src/stores/suppressedWarningsStore.ts";
import type { BaseRules } from "@/shared/enums.ts";

import { computeAbilityModifier } from "./abilities.ts";
import { AbilityScoreBox } from "./AbilityScoreBox.tsx";

export interface AbilityScoresSectionProps {
  abilities: CharacterDetail["abilities"];
  /** The sheet's base rules, which order its abilities. */
  baseRules: BaseRules;
  characterId: string;
  readOnly?: boolean;
}

export function AbilityScoresSection({ abilities, baseRules, characterId, readOnly }: AbilityScoresSectionProps) {
  const entries = Object.entries(abilities);
  const sortedEntries = sortAbilities(entries, baseRules, ([name]) => name);
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
        const updated = { ...old.abilities };
        for (const [name, data] of Object.entries(updated)) {
          if (data.abilityId === abilityId) {
            // Until the server answers: the total moves by the base's change, whatever else adds to it
            const total = data.total + score - data.base;
            updated[name] = { ...data, base: score, total, modifier: computeAbilityModifier(total) };
            break;
          }
        }
        return { ...old, abilities: updated };
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

  const handleBaseChange = (abilityId: string, score: number) => {
    const current = Object.values(abilities).find((a) => a.abilityId === abilityId);
    const currentBase = current?.base ?? 10;

    if (score > currentBase || !shouldWarn("abilityDecrease")) updateMutation.mutate({ abilityId, score });
    else decreaseDialog.openWith({ abilityId, score });
  };

  return (
    <SheetSection title="Ability Scores">
      {sortedEntries.length > 0 ? (
        <Stack direction="row" spacing={2} sx={{ flexWrap: "wrap", justifyContent: "center" }}>
          {sortedEntries.map(([ability, abilityData]) => (
            <Box key={ability} sx={{ minWidth: { xs: 120, sm: 140 } }}>
              <AbilityScoreBox
                ability={ability}
                score={abilityData.total}
                modifier={abilityData.modifier}
                abilityData={abilityData}
                onBaseChange={handleBaseChange}
                readOnly={readOnly}
              />
            </Box>
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
