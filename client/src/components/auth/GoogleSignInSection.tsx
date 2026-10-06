import { Divider } from "@mui/material";

import { useAuthRequests, useGoogleSignIn } from "@/client/src/hooks/index.ts";

import { GoogleSignInButton } from "./GoogleSignInButton.tsx";

interface GoogleSignInSectionProps {
  label?: string;
  disabled?: boolean;
  onSuccess: () => void;
  onError: (error: unknown) => void;
}

/** "or" divider plus the Google button, rendered only once Google Sign-In has loaded. */
export function GoogleSignInSection({ label, disabled, onSuccess, onError }: GoogleSignInSectionProps) {
  const { signInWithGoogle } = useAuthRequests({ onSignedIn: onSuccess });
  const { overlayRef, isAvailable } = useGoogleSignIn((idToken) => signInWithGoogle.mutate(idToken, { onError }));

  if (!isAvailable) return null;

  return (
    <>
      <Divider sx={{ my: 2 }}>or</Divider>
      <GoogleSignInButton overlayRef={overlayRef} disabled={disabled} label={label} />
    </>
  );
}
