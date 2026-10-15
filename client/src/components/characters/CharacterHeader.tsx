import { Box, Stack, TextField } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { Fragment, type MouseEvent, useState } from "react";
import { useController } from "react-hook-form";

import { CLICKABLE_SX, clickableProps, DetailPageHeader } from "@/client/src/components/common/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useFormWith } from "@/client/src/hooks/index.ts";
import { type CharacterDetail, invalidateCharacter, invalidateCharacterListings } from "@/client/src/lib/queries.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { CLASS_SEPARATOR } from "@/shared/characterClasses.ts";

import { ClassLevels, type EditingLevel } from "./ClassLevels.tsx";

interface CharacterHeaderProps {
  /** Where Back goes; a shared sheet's viewer has nowhere to go back to */
  backTo?: string;
  /** Its classes, by name, which its line under its name shows: those it has levels in (a Partial one's none) */
  classes: CharacterDetail["classes"];
  name: string;
  /** Opens Add Level with a class planned, from the class's popover: an editor's, while it takes levels of its own */
  onAddLevel?: (klassId: string) => void;
  /** Opens Edit Level on one of a class's levels; a read-only viewer sees the levels without it. */
  onEditLevel?: (editingLevel: EditingLevel) => void;
  onMenuOpen?: (event: MouseEvent<HTMLElement>) => void;
  /** Given when the viewer can rename the character: clicking its name edits it */
  rename?: CharacterRename;
  /** Its ruleset, whose class pages its classes' levels link to; a viewer outside it gets no link */
  rulesetId?: string;
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
      parseResponse(rpc.api.characters[":id"].$put({ param: { id: characterId }, json: { name: next, updatedAt } })),
    onSuccess: async () => {
      snackbar.success("Character updated");
      // The character refetches, and its cards, so the new name shows everywhere
      void invalidateCharacterListings(queryClient);
      await invalidateCharacter(queryClient, characterId);
      if (parentCharacterId) await invalidateCharacter(queryClient, parentCharacterId);
      onDone();
    },
    // The field stays, with the name typed, to try again or cancel
    onError: (error) => snackbar.error(error, "Failed to rename character"),
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
        // The title's line, its height and no padding: the header keeps its size as the name turns into its field
        "& .MuiInputBase-input": {
          fontWeight: 700,
          typography: { xs: "h4", md: "h3" },
          textAlign: "center",
          height: "auto",
          p: 0,
        },
      }}
    />
  );
}

/**
 * A character page's header: the character's name, which an editor renames in place, over its line: its classes with
 * their levels ("Fighter 3 · Rogue 1", as its PDF's first page names them), each opening its levels, where an editor
 * adds a level of the class, or text for a viewer with nothing to do there; then its ruleset.
 */
export function CharacterHeader({
  name,
  classes,
  rulesetId,
  rulesetName,
  backTo,
  onAddLevel,
  onEditLevel,
  onMenuOpen,
  rename,
}: CharacterHeaderProps) {
  const [renaming, setRenaming] = useState(false);
  const shown = name || "Unnamed Character";
  const classList = Object.values(classes);

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
      description={
        // Its line wraps, centered, as the header's text does: each class keeps its level, and its arrow
        <Stack
          direction="row"
          sx={{ justifyContent: "center", alignItems: "center", flexWrap: "wrap", columnGap: 2, rowGap: 1 }}
        >
          {classList.length > 0 && (
            // A line of text, which wraps between its classes alone
            <Box component="span" sx={{ whiteSpace: "nowrap" }}>
              {classList.map(({ klass, levels }, index) => (
                <Fragment key={klass.id}>
                  {index > 0 && (
                    <Box component="span" sx={{ whiteSpace: "normal" }}>
                      {CLASS_SEPARATOR}
                    </Box>
                  )}
                  <ClassLevels
                    klass={klass}
                    levels={levels}
                    classLink={rulesetId && `/rulesets/${rulesetId}/classes/${klass.id}`}
                    onAddLevel={onAddLevel}
                    onEditLevel={onEditLevel}
                  />
                </Fragment>
              ))}
            </Box>
          )}
          <Box component="span">{rulesetName || "Character Sheet"}</Box>
        </Stack>
      }
      backTo={backTo}
      onMenuOpen={onMenuOpen}
    />
  );
}
