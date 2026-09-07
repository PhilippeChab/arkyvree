import { Dialog, type DialogProps } from "@mui/material";

import { useIsMobile } from "@/client/src/hooks/index.ts";

export type ModalProps = DialogProps;

/**
 * Bare dialog primitive with project defaults: `fullScreen` on mobile,
 * `fullWidth`, `maxWidth="sm"`. No form-awareness. Use this for
 * informational / wizard / confirm-style dialogs that don't bind a
 * React Hook Form. For form dialogs use `FormDialog` (which wraps this
 * with a dirty-state close-block) or `CreateDialog`/`EditDialog`.
 *
 * Singletary place in the codebase that imports raw MUI `Dialog` —
 * the lint config bans the direct import everywhere else.
 */
export function Modal({
  fullWidth = true,
  maxWidth = "sm",
  ...rest
}: ModalProps) {
  const isMobile = useIsMobile();
  return <Dialog {...rest} fullWidth={fullWidth} maxWidth={maxWidth} fullScreen={isMobile} />;
}
