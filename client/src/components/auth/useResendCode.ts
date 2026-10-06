import { useState } from "react";

import { errorMessage } from "@/client/src/lib/errorMessage.ts";

/** What a resend reports back: the mutation's callbacks. */
interface ResendCallbacks {
  onSuccess: () => void;
  onError: (error: unknown) => void;
}

/**
 * A verification-code page's error, and resending its code (`resend` runs its mutation with the callbacks it's
 * given): `notice` confirms a code went out until a later request fails.
 */
export function useResendCode(resend: (callbacks: ResendCallbacks) => void) {
  const [error, setPageError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const setError = (next: string | null) => {
    setPageError(next);
    if (next) setResent(false);
  };

  const handleResend = () => {
    setError(null);
    setResent(false);
    resend({
      onSuccess: () => setResent(true),
      onError: (error) => setError(errorMessage(error, "Failed to resend code")),
    });
  };

  return { error, setError, handleResend, notice: resent ? "A new code has been sent to your email." : null };
}
