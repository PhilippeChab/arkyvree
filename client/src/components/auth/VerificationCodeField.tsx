import { type Control, type FieldPath, type FieldValues, useController } from "react-hook-form";

import { EMPTY_VERIFICATION_CODE } from "./verificationCode.ts";
import { VerificationCodeInput } from "./VerificationCodeInput.tsx";

interface VerificationCodeFieldProps<T extends FieldValues> {
  control: Control<T>;
  /** Its form's digits (`VerificationCodeFormData`'s), a form that may ask more (a reset's new password). */
  name: FieldPath<T>;
}

/** A code's digits, bound to its form's field: a box a digit, and a failed submit focuses the first. */
export function VerificationCodeField<T extends FieldValues>({ control, name }: VerificationCodeFieldProps<T>) {
  const { field } = useController({ control, name });
  // Read as the form holds it, its digits from `EMPTY_VERIFICATION_CODE` on
  const digits: string[] = Array.isArray(field.value) ? field.value : EMPTY_VERIFICATION_CODE;
  return <VerificationCodeInput digits={digits} onChange={field.onChange} inputRef={field.ref} />;
}
