import { Container, Menu, Stack } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import {
  CharacterDetailSkeleton,
  CharacterHeader,
  CharacterSheetBody,
} from "@/client/src/components/characters/index.ts";
import { ActionMenuItem, PageError, PageTransition } from "@/client/src/components/common/index.ts";
import { DownloadIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useAnchorMenu, usePageTitle } from "@/client/src/hooks/index.ts";
import { saveBlob } from "@/client/src/lib/download.ts";
import { accessLost, loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { ApiError } from "@/client/src/services/ApiError.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { sharedCharacterQuery } from "./sharedQueries.ts";

/** The sheet's file name: the character's, with what a file name can't hold replaced. */
function sheetFileName(characterName: string | undefined) {
  return `${(characterName || "character").replace(/[/\\?%*:|"<>]/g, "_").slice(0, 200)}-sheet.pdf`;
}

export default function SharedCharacterPage() {
  const { shareToken = "" } = useParams<{ shareToken: string }>();
  const snackbar = useSnackbar();
  const menu = useAnchorMenu();

  const { data: character, isLoading, error } = useQuery(sharedCharacterQuery(shareToken));

  usePageTitle(character?.identity?.physiology?.name);

  const downloadPdf = useMutation({
    // A file: its body is a blob, never JSON
    mutationFn: async () => (await rpc.api.shared.characters[":shareToken"].pdf.$get({ param: { shareToken } })).blob(),
    onSuccess: (blob) => saveBlob(blob, sheetFileName(character?.identity?.physiology?.name)),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 429)
        snackbar.warning("Too many PDF requests: try again in a minute");
      else snackbar.error(error, "Failed to download PDF");
    },
    // The menu waits with it, its item a spinner
    onSettled: menu.closeMenu,
  });

  if (isLoading) return <CharacterDetailSkeleton />;

  // A passing refetch failure keeps the loaded sheet; a revoked link hides it.
  if (!character || accessLost(error)) {
    return (
      <Container maxWidth="xl">
        <PageError message={loadFailureMessage("Character sheet", error)} />
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="xl">
        <Stack spacing={4}>
          <CharacterHeader
            name={character.identity?.physiology?.name ?? ""}
            rulesetName={character.rulesetName}
            onMenuOpen={menu.openMenu}
          />
          <Menu anchorEl={menu.anchorEl} open={menu.open} onClose={menu.closeMenu}>
            <ActionMenuItem
              icon={DownloadIcon}
              label="Download PDF"
              pending={downloadPdf.isPending}
              onClick={() => downloadPdf.mutate()}
            />
          </Menu>

          <CharacterSheetBody
            character={character}
            characterId={character.id}
            readOnly
            equipmentMode="readonly"
            portraitUrl={character.portraitUrl ?? null}
          />
        </Stack>
      </Container>
    </PageTransition>
  );
}
