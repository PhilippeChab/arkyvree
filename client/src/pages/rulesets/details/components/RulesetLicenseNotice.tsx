import { Button, DialogActions, DialogContent, DialogTitle, Link as MuiLink, Stack, Typography } from "@mui/material";
import { useState } from "react";

import { DiceSpinner, LoadError, Modal } from "@/client/src/components/common/index.ts";
import { useOglLicense } from "@/client/src/hooks/index.ts";

interface RulesetLicenseNoticeProps {
  name: string;
}

export function RulesetLicenseNotice({ name }: RulesetLicenseNoticeProps) {
  const [open, setOpen] = useState(false);
  const { data: text, isPending, isError, error, refetch } = useOglLicense(open);

  return (
    <>
      <MuiLink
        component="button"
        type="button"
        variant="body2"
        underline="hover"
        onClick={() => setOpen(true)}
        sx={{ mt: 1 }}
      >
        License & Attribution
      </MuiLink>
      <Modal open={open} onClose={() => setOpen(false)} maxWidth="md" aria-labelledby="ruleset-license-title">
        <DialogTitle id="ruleset-license-title">License & Attribution</DialogTitle>
        <DialogContent dividers>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            {name}
          </Typography>
          <Typography variant="body2" sx={{ mb: 3 }}>
            This notice applies to the SRD-derived Open Game Content in this system source package. It does not license
            the application code or designate independent user-created content as Open Game Content.
          </Typography>
          {isPending && (
            <Stack role="status" aria-label="Loading license" direction="row" sx={{ justifyContent: "center", py: 4 }}>
              <DiceSpinner />
            </Stack>
          )}
          {isError && <LoadError what="License text" error={error} onRetry={() => void refetch()} />}
          {text !== undefined && (
            <Typography
              component="pre"
              variant="body2"
              sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "inherit", m: 0 }}
            >
              {text}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} variant="outlined" color="inherit">
            Close
          </Button>
        </DialogActions>
      </Modal>
    </>
  );
}
