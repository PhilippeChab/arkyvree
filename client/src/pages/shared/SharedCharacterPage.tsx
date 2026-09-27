import { PageTransition, DiceSpinner, PageError } from "@/client/src/components/common/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { parseResponse, rpc } from "@/client/src/services/rpc.ts";
import { CharacterSheetBody, downloadPdf } from "@/client/src/components/characters/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { Download as DownloadIcon } from "@mui/icons-material";
import { Container, IconButton, Paper, Stack, Typography } from "@mui/material";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { useQuery, skipToken } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

export default function SharedCharacterPage() {
  const { shareToken = "" } = useParams<{ shareToken: string }>();
  const snackbar = useSnackbar();

  const {
    data: character,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.shared.character(shareToken),
    queryFn: shareToken
      ? () => parseResponse(rpc.api.shared.characters[":shareToken"].$get({ param: { shareToken } }))
      : skipToken,
  });

  usePageTitle(character?.identity?.physiology?.name);

  const handleDownloadPdf = () => {
    if (!shareToken) return;
    downloadPdf(
      () => rpc.api.shared.characters[":shareToken"]["pdf"]["$get"]({ param: { shareToken } }),
      character?.identity?.physiology?.name,
      (msg) => snackbar.error(msg),
    );
  };

  if (isLoading) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <DiceSpinner sx={{ minHeight: 400 }} />
      </Container>
    );
  }

  if (error || !character) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <PageError message="This character sheet is not available or the link has been revoked." />
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="xl" sx={{ py: 2 }}>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 1 }}>
            <Typography sx={{ fontWeight: 700, typography: { xs: "h5", md: "h4" } }} noWrap>
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
      </Container>
    </PageTransition>
  );
}
