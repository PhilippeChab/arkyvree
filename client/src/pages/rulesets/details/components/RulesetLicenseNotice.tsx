import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link,
  Typography,
} from "@mui/material";

import { DiceSpinner, Modal } from "@/client/src/components/common/index.ts";
import { useOglLicense } from "@/client/src/hooks/index.ts";

interface RulesetLicenseNoticeProps {
  name: string;
}

export function RulesetLicenseNotice({ name }: RulesetLicenseNoticeProps) {
  const [open, setOpen] = useState(false);
  const { data: text, isPending, isError, refetch } = useOglLicense(open);

  return (
    <>
      <Link
        component="button"
        type="button"
        variant="body2"
        underline="hover"
        onClick={() => setOpen(true)}
        sx={{ mt: 1 }}
      >
        License & attribution
      </Link>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="md"
        aria-labelledby="ruleset-license-title"
      >
        <DialogTitle id="ruleset-license-title">License & attribution</DialogTitle>
        <DialogContent dividers>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
            {name}
          </Typography>
          <Typography variant="body2" sx={{ mb: 3 }}>
            This notice applies to the SRD-derived Open Game Content in this system source
            package. It does not license the application code or designate independent
            user-created content as Open Game Content.
          </Typography>
          {isPending && (
            <Box role="status" aria-label="Loading license" sx={{ display: "flex", justifyContent: "center", py: 4 }}>
              <DiceSpinner />
            </Box>
          )}
          {isError && (
            <Alert severity="error" action={<Button color="inherit" onClick={() => void refetch()}>Retry</Button>}>
              Failed to load the license text.
            </Alert>
          )}
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
          <Button onClick={() => setOpen(false)} variant="outlined" color="inherit">Close</Button>
        </DialogActions>
      </Modal>
    </>
  );
}
