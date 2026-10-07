import { Box, TextField } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { type MouseEvent, useState } from "react";
import { useController } from "react-hook-form";

import { CLICKABLE_SX, clickableProps, DetailPageHeader } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

interface CharacterHeaderProps {
  /** Where Back goes; a shared sheet's viewer has nowhere to go back to */
  backTo?: string;
  name: string;
  onMenuOpen?: (event: MouseEvent<HTMLElement>) => void;
  /** Given when the viewer can rename the character: clicking its name edits it */
  rename?: CharacterRename;
  rulesetName?: string | null;
}

interface CharacterNameEditorProps extends CharacterRename {
  name: string;
  onDone: () => void;
}

/** The character an editor renames in place, and the version the rename is made against */
interface CharacterRename {
  characterId: string;
  /** A bonded creature's master, whose sheet lists it by name */
  parentCharacterId?: string | null;
  updatedAt: string;
}

/** The name's field while it's renamed: Enter or leaving the field saves, Escape cancels. */
function CharacterNameEditor({ characterId, updatedAt, parentCharacterId, name, onDone }: CharacterNameEditorProps) {
  const queryClient = useQueryClient();
  const snackbar = useSnackbar();
  const form = useFormWith<{ name: string }>({ name });
  const { field } = useController({ control: form.control, name: "name" });
  const rename = useMutation({
    mutationFn: (next: string) =>
      parseResponse(rpc.api.characters[":id"]["$put"]({ param: { id: characterId }, json: { name: next, updatedAt } })),
    onSuccess: async () => {
      // The character's detail refetches, so the new name shows everywhere
      await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.characters.detail(characterId) });
      if (parentCharacterId)
        await queryClient.invalidateQueries({ queryKey: QUERY_KEYS.characters.detail(parentCharacterId) });
    },
    onError: (err) => snackbar.error(err, "Failed to rename character"),
    onSettled: onDone,
  });
  const save = form.handleSubmit(({ name: next }) => {
    const trimmed = next.trim();
    if (!trimmed || trimmed === name) onDone();
    else rename.mutate(trimmed);
  });

  return (
    <TextField
      value={field.value}
      onChange={field.onChange}
      inputRef={field.ref}
      onBlur={() => save()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (e.target instanceof HTMLElement) e.target.blur();
        } else if (e.key === "Escape") {
          onDone();
        }
      }}
      autoFocus
      disabled={rename.isPending}
      variant="standard"
      slotProps={{ htmlInput: { "aria-label": "Character Name", maxLength: 255 } }}
      sx={{
        "& .MuiInputBase-input": { fontWeight: 700, typography: { xs: "h4", md: "h3" }, textAlign: "center" },
      }}
    />
  );
}

/** A character page's header: the character's name, which an editor renames in place, over its ruleset's name. */
export function CharacterHeader({ name, rulesetName, backTo, onMenuOpen, rename }: CharacterHeaderProps) {
  const [renaming, setRenaming] = useState(false);
  const shown = name || "Unnamed Character";

  return (
    <DetailPageHeader
      title={
        rename ? (
          <Box
            component="span"
            role="button"
            {...clickableProps(() => setRenaming(true))}
            sx={{
              ...CLICKABLE_SX,
              "&:hover": { textDecoration: "underline", textDecorationStyle: "dotted", textUnderlineOffset: "4px" },
            }}
          >
            {shown}
          </Box>
        ) : (
          shown
        )
      }
      titleEditor={
        rename && renaming ? (
          <CharacterNameEditor {...rename} name={name} onDone={() => setRenaming(false)} />
        ) : undefined
      }
      description={rulesetName || "Character Sheet"}
      backTo={backTo}
      onMenuOpen={onMenuOpen}
    />
  );
}
