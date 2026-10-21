import { DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import { useState } from "react";

import {
  DialogFooter,
  LinkButton,
  Modal,
  OglLicenseText,
  SubsectionTitle,
} from "@/client/src/components/common/index.ts";
import type { RulesDescription } from "@/client/src/lib/queries.ts";

interface LicenseNoticeProps {
  /** What its rules say its content is licensed under: their notice, and the license whose text the app serves */
  license: NonNullable<RulesDescription["license"]>;
  /** The system ruleset's. */
  name: string;
}

/** A system ruleset's License & Attribution, under its header: its rules' notice, and its license's text. */
export function LicenseNotice({ license, name }: LicenseNoticeProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Stack sx={{ alignItems: "center" }}>
        <LinkButton variant="body2" onClick={() => setOpen(true)}>
          License & Attribution
        </LinkButton>
      </Stack>
      <Modal open={open} onClose={() => setOpen(false)}>
        <DialogTitle>License & Attribution</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={3}>
            <Stack spacing={1}>
              <SubsectionTitle>{name}</SubsectionTitle>
              <Typography variant="body2">{license.notice}</Typography>
            </Stack>
            {/* Its dialog's content mounts as it opens: the license loads then (`text`: the Open Game License alone) */}
            <OglLicenseText />
          </Stack>
        </DialogContent>
        <DialogFooter onCancel={() => setOpen(false)} cancelLabel="Close" />
      </Modal>
    </>
  );
}
