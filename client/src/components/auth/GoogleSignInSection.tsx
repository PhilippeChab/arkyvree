import { Divider } from "@mui/material";

import { useGoogleSignIn } from "@/client/src/hooks/index.ts";
import { useAuthStore } from "@/client/src/stores/authStore.ts";
import { GoogleSignInButton } from "./GoogleSignInButton.tsx";

interface GoogleSignInSectionProps {
  label?: string;
  disabled?: boolean;
  onSuccess: () => void;
  onError: (error: unknown) => void;
}

/** "or" divider plus the Google button, rendered only once Google Sign-In has loaded. */
export function GoogleSignInSection({ label, disabled, onSuccess, onError }: GoogleSignInSectionProps) {
  const signInWithGoogle = useAuthStore((s) => s.signInWithGoogle);
  const { overlayRef, isAvailable } = useGoogleSignIn(async (idToken) => {
    try {
      await signInWithGoogle(idToken);
      onSuccess();
    } catch (error) {
      onError(error);
    }
  });

  if (!isAvailable) return null;

  return (
    <>
      <Divider sx={{ my: 2 }}>or</Divider>
      <GoogleSignInButton overlayRef={overlayRef} disabled={disabled} label={label} />
    </>
  );
}
