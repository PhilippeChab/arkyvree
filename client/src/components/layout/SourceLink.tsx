import { Link as MuiLink, Stack } from "@mui/material";

import { EXTERNAL_LINKS } from "@/client/src/lib/externalLinks.ts";

interface SourceLinkProps {
  /** Its line's text: the app's footer's caption, the auth pages' body. */
  variant: "body2" | "caption";
}

/** The link to the app's source, in a footer's line (the app's, the auth pages'): tall enough to tap. */
export function SourceLink({ variant }: SourceLinkProps) {
  return (
    <Stack
      component={MuiLink}
      direction="row"
      href={EXTERNAL_LINKS.source}
      target="_blank"
      rel="noopener noreferrer"
      variant={variant}
      underline="hover"
      sx={{ color: "text.secondary", display: "inline-flex", alignItems: "center", minHeight: 44 }}
    >
      Source
    </Stack>
  );
}
