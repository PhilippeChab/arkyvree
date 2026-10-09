import { DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import { useState } from "react";

import {
  DialogFooter,
  LinkButton,
  Modal,
  OglLicenseText,
  SubsectionTitle,
} from "@/client/src/components/common/index.ts";

interface RulesetLicenseNoticeProps {
  name: string;
}

export function RulesetLicenseNotice({ name }: RulesetLicenseNoticeProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Stack sx={{ alignItems: "center" }}>
        <LinkButton variant="body2" onClick={() => setOpen(true)}>
          License & Attribution
        </LinkButton>
      </Stack>
      <Modal open={open} onClose={() => setOpen(false)} aria-labelledby="ruleset-license-title">
        <DialogTitle id="ruleset-license-title">License & Attribution</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3}>
            <Stack spacing={1}>
              <SubsectionTitle>{name}</SubsectionTitle>
              <Typography variant="body2">
                This notice applies to the SRD-derived Open Game Content in this system source package. It does not
                license the application code or designate independent user-created content as Open Game Content.
              </Typography>
            </Stack>
            {/* Its dialog's content mounts as it opens: the license loads then */}
            <OglLicenseText />
          </Stack>
        </DialogContent>
        <DialogFooter onCancel={() => setOpen(false)} cancelLabel="Close" />
      </Modal>
    </>
  );
}
