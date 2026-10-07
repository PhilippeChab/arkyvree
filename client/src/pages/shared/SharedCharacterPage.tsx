import { Container, IconButton, Paper, Stack, Typography } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { CharacterSheetBody, downloadPdf } from "@/client/src/components/characters/index.ts";
import { DiceSpinner, PageError, PageTransition } from "@/client/src/components/common/index.ts";
import { DownloadIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { accessLost } from "@/client/src/lib/errorMessage.ts";
import { rpc } from "@/client/src/services/rpc.ts";

import { sharedCharacterQuery } from "./sharedQueries.ts";

export default function SharedCharacterPage() {
  const { shareToken = "" } = useParams<{ shareToken: string }>();
  const snackbar = useSnackbar();

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
        <DiceSpinner sx={{ minHeight: 400 }} />
      </Container>
    );
  }

  // A passing refetch failure keeps the loaded sheet; a revoked link hides it.
  if (!character || accessLost(error)) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <PageError message="This character sheet is not available or the link has been revoked." />
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="xl" sx={{ py: 2 }}>
        <Stack spacing={2}>
          <Paper sx={{ p: 2 }}>
            <Stack
              direction="row"
              spacing={1}
              sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}
            >
              <Typography component="p" sx={{ fontWeight: 700, typography: { xs: "h5", md: "h4" } }} noWrap>
                {character.rulesetName || "Character Sheet"}
              </Typography>

              <IconButton aria-label="Download PDF" onClick={handleDownloadPdf} sx={{ color: "text.secondary" }}>
                <DownloadIcon />
              </IconButton>
            </Stack>
          </Paper>

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
