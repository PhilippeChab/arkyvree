type SuccessResult<N> = [true, N, undefined];
type ErrorResult = [false, undefined, Error];
type Result<N> = SuccessResult<N> | ErrorResult;

async function safePromisify<N>(cb: () => N | Promise<N>): Promise<Result<N>> {
  try {
    const result = await Promise.try(cb);
    return [true, result, undefined];
  } catch (error) {
    const e = error as Error;
    return [false, undefined, e];
  }
}

export { safePromisify };
export type { ErrorResult, Result, SuccessResult };

export const sanitizeText = (text: string) => text.normalize("NFKC").trim();
export const sanitizeEmail = (email: string) => sanitizeText(email).toLowerCase();
export const sanitizeURL = (url: string) => encodeURIComponent(url.normalize("NFKC"));

const cryptoHash = async (text: string) => {
  const messageBuffer = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", messageBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const hashPassword = (password: string) => {
  const isTest = process.env.DATABASE_URL?.includes("test");
  return Bun.password.hash(password, {
    algorithm: "argon2id",
    ...(isTest && { timeCost: 1, memoryCost: 1024 }),
  });
};

export const verifyPassword = async (
  password: string,
  hash: string,
): Promise<{ verified: boolean; needsRehash: boolean }> => {
  if (hash.startsWith("$argon2")) {
    const verified = await Bun.password.verify(password, hash);
    return { verified, needsRehash: false };
  }

  const sha256 = await cryptoHash(password);
  const verified = sha256 === hash;
  return { verified, needsRehash: verified };
};

export const capitalize = (s: string) => String(s).charAt(0).toUpperCase() + String(s).slice(1);
export const stripSeparators = (s: string) =>
  String(s).replaceAll(/[^a-z0-9]/gi, "").toLowerCase();

/**
 * Derives the slug used in spell possession paths from an aptitude name.
 * Strips the " Spells" suffix so paths read naturally
 * (e.g. "Wizard Spells" → "wizard", "Knowledge Domain Spells" → "knowledgedomain").
 */
export const spellPossessionSlug = (aptitudeName: string) =>
  stripSeparators(aptitudeName.replace(/ Spells$/, ""));

/** Formats an UPPER_SNAKE_CASE property type into a human-readable label (e.g. "SPELL_SCHOOL" → "Spell School") */
export const formatPropertyType = (type: string) =>
  type.split("_").map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(" ");

/** Formats a raw path segment into a human-readable label (e.g. "privateNotes" → "Private Notes") */
export const formatSegment = (segment: string) =>
  segment.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/** Derives segment labels from path definitions, with explicit overrides taking priority */
export function deriveSegmentLabels(
  paths: { path: string }[],
  overrides: Record<string, string> = {},
): Record<string, string> {
  const labels: Record<string, string> = { ...overrides };
  for (const p of paths) {
    for (const seg of p.path.split(".")) {
      if (!(seg in labels)) labels[seg] = formatSegment(seg);
    }
  }
  return labels;
}
