const encoder = new TextEncoder();

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  let str = "";
  for (const byte of bytes) str += String.fromCharCode(byte);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signFeaturebaseJwt(user: {
  id: string;
  emailAddress: string;
  username: string | null;
}): Promise<string | null> {
  const secret = process.env.FEATUREBASE_JWT_SECRET;
  if (!secret) return null;

  const header = { alg: "HS256", typ: "JWT" };
  const iat = Math.floor(Date.now() / 1000);
  const payload = {
    name: user.username ?? user.emailAddress,
    email: user.emailAddress,
    userId: user.id,
    iat,
    exp: iat + 10 * 60, // 10 minutes — JWT only has to survive the boot request; Featurebase issues a 30-day session access token after a successful boot.
  };

  const data = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));

  return `${data}.${base64UrlEncode(new Uint8Array(signature))}`;
}
