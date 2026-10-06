import {
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Link as MuiLink,
  Stack,
  Typography,
} from "@mui/material";
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
        <DialogContent>
          <Stack spacing={3}>
            <Box>
              <Typography component="h3" variant="subtitle1" gutterBottom sx={{ fontWeight: 600 }}>
                {name}
              </Typography>
              <DialogContentText>
                This notice applies to the SRD-derived Open Game Content in this system source package. It does not
                license the application code or designate independent user-created content as Open Game Content.
              </DialogContentText>
            </Box>
            {isPending && <DiceSpinner sx={{ py: 4 }} />}
            {isError && <LoadError what="License text" error={error} onRetry={() => void refetch()} />}
            {text !== undefined && (
              <DialogContentText
                component="pre"
                sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "inherit", m: 0 }}
              >
                {text}
              </DialogContentText>
            )}
          </Stack>
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
