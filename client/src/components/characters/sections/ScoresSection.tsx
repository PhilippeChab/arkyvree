import { Stack } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";

import { BlankNote, ConfirmDialog } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useDialogState } from "@/client/src/hooks/index.ts";
import { characterDetailQuery, invalidateCharacter } from "@/client/src/lib/queries.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { SCORE_ROW_GAP, SCORE_ROW_SX, SCORE_SLOT_SX } from "./scoreRow.ts";
import { ScoreTile } from "./ScoreTile.tsx";
import type { BlockOf, SheetScore } from "./sheetBlocks.ts";
import { SheetSection } from "./SheetSection.tsx";
import { useSuppressedWarningsStore } from "./suppressedWarningsStore.ts";

/** A score's base set: the score's key, and its new base. */
interface BaseChange {
  base: number;
  key: string;
}

interface EditableScoresProps {
  block: BlockOf<"scores">;
  characterId: string;
  edit: NonNullable<BlockOf<"scores">["edit"]>;
}

interface ScoreRowProps {
  /** A score's base set to `base`, by its owner's edit (none read only). */
  onBaseChange?: (score: SheetScore, base: number) => void;
  scores: SheetScore[];
}

interface ScoresSectionProps {
  block: BlockOf<"scores">;
  characterId: string;
  readOnly?: boolean;
}

/**
 * A block's scores as their owner edits them: a base raised at once, a lower one asked first (it may break what the
 * character took), unless its warning is off for the session. Until the server answers, a score's value moves by its
 * base's change, whatever else adds to it, and its badge stays the one it gave.
 */
function EditableScores({ block, characterId, edit }: EditableScoresProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();

  const queryKey = characterDetailQuery(characterId).queryKey;

  const updateMutation = useMutation({
    mutationFn: async ({ key, base }: BaseChange) =>
      parseResponse(
        rpc.api.characters[":id"].abilities.$put({
          param: { id: characterId },
          json: { [key]: base },
        }),
      ),
    onMutate: async ({ key, base }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData(queryKey);

      queryClient.setQueryData(queryKey, (old) => {
        if (!old) return old;
        const moved = (score: SheetScore) =>
          score.key === key && score.base
            ? { ...score, base: { ...score.base, value: base }, value: score.value + base - score.base.value }
            : score;
        const blocks = old.blocks.map((sheetBlock) =>
          sheetBlock.kind === "scores" && sheetBlock.key === block.key
            ? { ...sheetBlock, scores: sheetBlock.scores.map(moved) }
            : sheetBlock,
        );
        return { ...old, blocks };
      });

      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);

      snackbar.error(error, edit.failed);
    },
    onSettled: () => invalidateCharacter(queryClient, characterId),
  });

  const lowerDialog = useDialogState<BaseChange>();
  const shouldWarn = useSuppressedWarningsStore((s) => s.shouldWarn);
  const suppressWarningForSession = useSuppressedWarningsStore((s) => s.suppressWarningForSession);

  const handleBaseChange = ({ key, base }: SheetScore, value: number) => {
    if (!base) return;
    if (value > base.value || !shouldWarn(block.key)) updateMutation.mutate({ key, base: value });
    else lowerDialog.openWith({ key, base: value });
  };

  return (
    <>
      <ScoreRow scores={block.scores} onBaseChange={handleBaseChange} />
      <ConfirmDialog
        open={lowerDialog.open}
        onClose={lowerDialog.close}
        title={edit.lower.title}
        message={edit.lower.message}
        confirmLabel={edit.lower.confirm}
        onConfirm={() => {
          if (!lowerDialog.target) return;
          updateMutation.mutate(lowerDialog.target, {
            onSuccess: () => {
              lowerDialog.close();
              suppressWarningForSession(block.key);
            },
          });
        }}
        pending={updateMutation.isPending}
      />
    </>
  );
}

/** A row of scores' boxes: its short last line centered under the others; without badges, the space under it kept. */
function ScoreRow({ scores, onBaseChange }: ScoreRowProps) {
  const badged = scores.some((score) => score.badge !== undefined);
  return (
    <Stack direction="row" spacing={SCORE_ROW_GAP} sx={badged ? SCORE_ROW_SX : [SCORE_ROW_SX, { pb: 2 }]}>
      {scores.map((score) => (
        <ScoreTile key={score.key} sx={SCORE_SLOT_SX} score={score} onBaseChange={onBaseChange} />
      ))}
    </Stack>
  );
}

/**
 * A `scores` block: its scores in boxes, side by side (3.5's ability scores, and its saving throws). Its owner edits
 * the bases that are the character's own (`edit`), unless the sheet is read only.
 */
export function ScoresSection({ block, characterId, readOnly }: ScoresSectionProps) {
  const { edit } = block;
  return (
    <SheetSection title={block.title}>
      {block.scores.length === 0 ? (
        <BlankNote>{block.empty}</BlankNote>
      ) : edit && !readOnly ? (
        <EditableScores block={block} characterId={characterId} edit={edit} />
      ) : (
        <ScoreRow scores={block.scores} />
      )}
    </SheetSection>
  );
}
