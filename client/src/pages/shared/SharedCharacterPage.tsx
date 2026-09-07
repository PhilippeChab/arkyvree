import { PageTransition, DiceSpinner } from "@/client/src/components/common/index.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";
import { CharacterSheetBody, downloadPdf } from "@/client/src/components/characters/index.ts";
import { useSnackbar } from "@/client/src/contexts/ToastContext.tsx";
import { Download as DownloadIcon } from "@mui/icons-material";
import { Alert, Box, Container, IconButton, Paper, Stack, Typography } from "@mui/material";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

export default function SharedCharacterPage() {
  const { shareToken } = useParams<{ shareToken: string }>();
  const snackbar = useSnackbar();

  const {
    data: character,
    isLoading,
    error,
  } = useQuery({
    queryKey: queryKeys.shared.character(shareToken!),
    queryFn: async () => {
      if (!shareToken) throw new Error("Share token is required");
      const response = await rpc.api.shared.characters[":shareToken"]["$get"]({
        param: { shareToken },
      });
      if (!response.ok) throw new Error("Failed to fetch shared character");
      return response.json();
    },
    enabled: !!shareToken,
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
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: 400 }}>
          <DiceSpinner />
        </Box>
      </Container>
    );
  }

  if (error || !character || "error" in character) {
    return (
      <Container maxWidth="xl" sx={{ py: 4 }}>
        <Alert severity="error">
          This character sheet is not available or the link has been revoked.
        </Alert>
      </Container>
    );
  }

  return (
    <PageTransition>
      <Container maxWidth="xl" sx={{ py: 2 }}>
        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack
            direction="row"
            sx={{
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 1
            }}>
            <Typography sx={{ fontWeight: 700, typography: { xs: "h5", md: "h4" } }} noWrap>
              {character.rulesetName || "Character Sheet"}
            </Typography>

            <IconButton onClick={handleDownloadPdf} sx={{ color: "text.secondary" }}>
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
