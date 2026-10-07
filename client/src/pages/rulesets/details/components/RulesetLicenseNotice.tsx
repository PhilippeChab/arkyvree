import { DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import { useState } from "react";

import { DialogFooter, DiceSpinner, LinkButton, LoadError, Modal } from "@/client/src/components/common/index.ts";
import { useOglLicense } from "@/client/src/hooks/index.ts";

interface RulesetLicenseNoticeProps {
  name: string;
}

export function RulesetLicenseNotice({ name }: RulesetLicenseNoticeProps) {
  const [open, setOpen] = useState(false);
  const { data: text, isPending, error, refetch } = useOglLicense(open);

  return (
    <>
      <Stack sx={{ alignItems: "center" }}>
        <LinkButton variant="body2" onClick={() => setOpen(true)}>
          License & Attribution
        </LinkButton>
      </Stack>
      <Modal open={open} onClose={() => setOpen(false)} maxWidth="md" aria-labelledby="ruleset-license-title">
        <DialogTitle id="ruleset-license-title">License & Attribution</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3}>
            <Stack spacing={1}>
              <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>
                {name}
              </Typography>
              <Typography variant="body2">
                This notice applies to the SRD-derived Open Game Content in this system source package. It does not
                license the application code or designate independent user-created content as Open Game Content.
              </Typography>
            </Stack>
            {isPending && (
              <Stack
                role="status"
                aria-label="Loading License"
                direction="row"
                sx={{ justifyContent: "center", py: 4 }}
              >
                <DiceSpinner />
              </Stack>
            )}
            {!!error && text === undefined && (
              <LoadError what="License text" error={error} onRetry={() => void refetch()} />
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
          </Stack>
        </DialogContent>
        <DialogFooter onCancel={() => setOpen(false)} cancelLabel="Close" />
      </Modal>
    </>
  );
}
