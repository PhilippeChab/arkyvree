import { VERIFICATION_CODE_LENGTH } from "@/shared/auth.ts";

interface CodeSentMessageProps {
  /** Where the code went. */
  email: string;
}

/** A verification code's lead line: enter the code of `VERIFICATION_CODE_LENGTH` digits sent to `email`. */
export function CodeSentMessage({ email }: CodeSentMessageProps) {
  return (
    <>
      Enter the {VERIFICATION_CODE_LENGTH}-digit code we sent to <strong>{email}</strong>
    </>
  );
}
