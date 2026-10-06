import { z } from "zod";

import { sanitizedText } from "@/server/routers/api/validation.ts";
import { PASSWORD_MIN_LENGTH } from "@/shared/auth.ts";

/** A password a user sets: sanitized as it's stored, then at least `PASSWORD_MIN_LENGTH` long. */
export const sanitizedPassword = sanitizedText.min(PASSWORD_MIN_LENGTH);

/**
 * A body's check that a new password's confirmation (`<field>Confirmation`) repeats it, reported on the confirmation:
 * `.check(checkPasswordConfirmation("newPassword"))`.
 */
export function checkPasswordConfirmation<Field extends string>(field: Field) {
  const confirmation = `${field}Confirmation` as const;
  return z.refine<Record<Field | typeof confirmation, string>>((body) => body[field] === body[confirmation], {
    message: "Passwords do not match",
    path: [confirmation],
  });
}
