import { useState } from "react";

import { errorMessage } from "@/client/src/lib/errorMessage.ts";

/**
 * A verification-code page's error, and resending its code: `notice` confirms a
 * code went out until a later request fails.
 */
export function useResendCode(send: () => Promise<void>) {
  const [error, setPageError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const setError = (next: string | null) => {
    setPageError(next);
    if (next) setResent(false);
  };

  const handleResend = async () => {
    try {
      setError(null);
      setResent(false);
      await send();
      setResent(true);
    } catch (error) {
      setError(errorMessage(error, "Failed to resend code"));
    }
  };

  return { error, setError, handleResend, notice: resent ? "A new code has been sent to your email." : null };
}
