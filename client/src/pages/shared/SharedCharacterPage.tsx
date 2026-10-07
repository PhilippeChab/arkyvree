import { Container, Menu, Stack } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { CharacterHeader, CharacterSheetBody, downloadPdf } from "@/client/src/components/characters/index.ts";
import { ActionMenuItem, PageError, PageLoader, PageTransition } from "@/client/src/components/common/index.ts";
import { DownloadIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { useAnchorMenu, usePageTitle } from "@/client/src/hooks/index.ts";
import { accessLost, loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { sharedCharacterQuery } from "./sharedQueries.ts";

export default function SharedCharacterPage() {
  const { shareToken = "" } = useParams<{ shareToken: string }>();
  const snackbar = useSnackbar();
  const menu = useAnchorMenu();

  const { data: character, isLoading, error } = useQuery(sharedCharacterQuery(shareToken));

  usePageTitle(character?.identity?.physiology?.name);

  const handleDownloadPdf = () => {
    if (!shareToken) return;
    downloadPdf(
      () => rpc.api.shared.characters[":shareToken"]["pdf"]["$get"]({ param: { shareToken } }),
      character?.identity?.physiology?.name,
      (msg) => snackbar.error(msg, "Failed to download PDF"),
    );
  };

  if (isLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <PageLoader />
      </Container>
    );
  }

  // A passing refetch failure keeps the loaded sheet; a revoked link hides it.
  if (!character || accessLost(error)) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <PageError message={loadFailureMessage("Character sheet", error)} />
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="xl" sx={{ py: 2 }}>
        <Stack spacing={4}>
          <CharacterHeader
            name={character.identity?.physiology?.name ?? ""}
            rulesetName={character.rulesetName}
            onMenuOpen={menu.openMenu}
          />
          <Menu anchorEl={menu.anchorEl} open={menu.open} onClose={menu.closeMenu}>
            <ActionMenuItem icon={DownloadIcon} label="Download PDF" onClick={menu.closeMenuAnd(handleDownloadPdf)} />
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
