import { errorMessage } from "@/client/src/lib/errorMessage.ts";
import { useState } from "react";

/**
 * Resending a verification code: the page's error is cleared first and set on
 * failure; `notice` confirms a code went out.
 */
export function useResendCode(send: () => Promise<void>, setError: (error: string | null) => void) {
  const [resent, setResent] = useState(false);

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

  return { handleResend, notice: resent ? "A new code has been sent to your email." : null };
}
