import { UnauthorizedError } from "@/server/errors/index.ts";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

interface GoogleTokenPayload {
  sub: string;
  email: string;
  email_verified: boolean;
  name?: string;
  picture?: string;
  aud: string;
  iss: string;
  exp: number;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleTokenPayload> {
  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!response.ok) {
    throw new UnauthorizedError("Invalid Google ID token");
  }

  const payload = (await response.json()) as GoogleTokenPayload;

  if (!GOOGLE_CLIENT_ID || payload.aud !== GOOGLE_CLIENT_ID) {
    throw new UnauthorizedError("Invalid Google ID token audience");
  }

  if (payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com") {
    throw new UnauthorizedError("Invalid Google ID token issuer");
  }

  if (!payload.email_verified) {
    throw new UnauthorizedError("Google email not verified");
  }

  if (payload.exp * 1000 < Date.now()) {
    throw new UnauthorizedError("Google ID token expired");
  }

  return payload;
}
