import { IconButton, Paper, Stack, Typography } from "@mui/material";
import { skipToken, useQuery } from "@tanstack/react-query";
import { parseResponse } from "hono/client";
import { useParams } from "react-router-dom";

import { CharacterDetailSkeleton, CharacterSheetBody, downloadPdf } from "@/client/src/components/characters/index.ts";
import { PageBody, PageError } from "@/client/src/components/common/index.ts";
import { DownloadIcon } from "@/client/src/components/icons/index.ts";
import { useSnackbar } from "@/client/src/contexts/useSnackbar.ts";
import { usePageTitle } from "@/client/src/hooks/index.ts";
import { accessLost, loadFailureMessage } from "@/client/src/lib/errorMessage.ts";
import { queryKeys } from "@/client/src/lib/queryKeys.ts";
import { rpc } from "@/client/src/services/rpc.ts";

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
    return <CharacterDetailSkeleton />;
  }

  // A passing refetch failure keeps the loaded sheet; a revoked link hides it.
  if (!character || accessLost(error)) {
    return (
      <PageBody>
        <PageError message={loadFailureMessage("Character sheet", error)} />
      </PageBody>
    );
  }

  return (
    <PageBody>
      <Paper sx={{ p: 2 }}>
        <Stack
          direction="row"
          spacing={1}
          sx={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}
        >
          <Typography component="p" sx={{ fontWeight: "fontWeightBold", typography: { xs: "h5", md: "h4" } }} noWrap>
            {character.rulesetName || "Character Sheet"}
          </Typography>

          <IconButton
            size="large"
            aria-label="Download PDF"
            onClick={handleDownloadPdf}
            sx={{ color: "text.secondary" }}
          >
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
    </PageBody>
  );
}
