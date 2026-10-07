import { Box, IconButton, Stack, Typography } from "@mui/material";
import { type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { ArrowBackIcon, MoreVertIcon } from "@/client/src/components/icons/index.ts";

import { NO_DESCRIPTION } from "./EmptyValue.tsx";

interface DetailPageHeaderProps {
  /** Where Back goes, a link; without it (a shared sheet's viewer has nowhere to go back to), its corner stays empty */
  backTo?: string;
  children?: ReactNode;
  chips?: ReactNode;
  /** What it is, in its owner's words: said to be missing when it has none (`NO_DESCRIPTION`) */
  description: ReactNode;
  /** Opens the page's action menu; the button is hidden when omitted. */
  onMenuOpen?: (event: MouseEvent<HTMLElement>) => void;
  /** Its text, or what renames it (a character's name, clicked) */
  title: ReactNode;
  /** Inline control after the title, e.g. a star toggle. */
  titleAdornment?: ReactNode;
  /** Shown in the title's place while the page's record is renamed */
  titleEditor?: ReactNode;
}

/** Centered title block of a ruleset, campaign or character page, with back and menu buttons. */
export function DetailPageHeader({
  title,
  titleEditor,
  titleAdornment,
  backTo,
  onMenuOpen,
  chips,
  description,
  children,
}: DetailPageHeaderProps) {
  const cornerButtonSx = { position: "absolute", "&:hover": { bgcolor: "action.hover" } } as const;

  return (
    <Stack
      direction="row"
      sx={{
        alignItems: "center",
        py: 2,
        borderBottom: 1,
        borderColor: "divider",
        position: "relative",
      }}
    >
      {backTo && (
        <IconButton component={Link} to={backTo} size="large" aria-label="Back" sx={{ ...cornerButtonSx, left: 0 }}>
          <ArrowBackIcon />
        </IconButton>
      )}
      {onMenuOpen && (
        <IconButton onClick={onMenuOpen} size="large" aria-label="More Actions" sx={{ ...cornerButtonSx, right: 0 }}>
          <MoreVertIcon />
        </IconButton>
      )}
      <Box sx={{ flexGrow: 1, textAlign: "center", px: { xs: 5, md: 8 } }}>
        <Stack spacing={1}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "center" }}>
            {titleEditor ?? (
              <Typography component="h1" sx={{ fontWeight: 700, typography: { xs: "h4", md: "h3" } }}>
                {title}
              </Typography>
            )}
            {titleAdornment}
          </Stack>
          <Stack spacing={2}>
            {chips && (
              <Stack direction="row" spacing={1} sx={{ justifyContent: "center", flexWrap: "wrap" }}>
                {chips}
              </Stack>
            )}
            {/* A block: a customization page's lays out a target path and its value */}
            <Typography component="div" variant="body1" sx={{ color: "text.secondary", maxWidth: 600, mx: "auto" }}>
              {description || NO_DESCRIPTION}
            </Typography>
          </Stack>
          {children}
        </Stack>
      </Box>
    </Stack>
  );
}
