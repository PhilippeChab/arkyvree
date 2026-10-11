import { VERIFICATION_CODE_LENGTH } from "@/shared/auth.ts";

interface CodeSentMessageProps {
  /** Where the code went. */
  email: string;
}

/**
 * A verification code's lead line: enter the code of `VERIFICATION_CODE_LENGTH` digits sent to `email`, which may have
 * landed in its spam.
 */
export function CodeSentMessage({ email }: CodeSentMessageProps) {
  return (
    <>
      Enter the {VERIFICATION_CODE_LENGTH}-digit code we sent to <strong>{email}</strong>. Don't see it? Check your spam
      or junk folder.
    </>
  );
}
