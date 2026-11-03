import { readEnv } from "@/server/environment.ts";
import { UnauthorizedError } from "@/server/errors/index.ts";

interface GoogleTokenPayload {
  aud: string;
  email: string;
  /** A text in tokeninfo's answer, `"true"` or `"false"`. */
  email_verified: boolean | string;
  exp: number;
  iss: string;
  name?: string;
  picture?: string;
  sub: string;
}

const GOOGLE_CLIENT_ID = readEnv("GOOGLE_CLIENT_ID");

/** Whether a token's `email_verified` says Google verified its address: the text `"false"` doesn't. */
export function isVerifiedByGoogle(emailVerified: boolean | string) {
  return emailVerified === true || emailVerified === "true";
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenPayload> {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) throw new UnauthorizedError("Invalid Google ID token");

  const payload = (await response.json()) as GoogleTokenPayload;

  if (!GOOGLE_CLIENT_ID || payload.aud !== GOOGLE_CLIENT_ID)
    throw new UnauthorizedError("Invalid Google ID token audience");

  if (payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com")
    throw new UnauthorizedError("Invalid Google ID token issuer");

  if (!isVerifiedByGoogle(payload.email_verified)) throw new UnauthorizedError("Google email not verified");

  if (payload.exp * 1000 < Date.now()) throw new UnauthorizedError("Google ID token expired");

  return payload;
}
