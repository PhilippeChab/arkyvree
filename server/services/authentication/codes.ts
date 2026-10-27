import type { Db } from "@/drizzle/database.ts";
import { compareInConstantTime } from "@/server/constantTime.ts";
import { UnauthorizedError } from "@/server/errors/index.ts";
import type { EmailVerifications, PasswordResets } from "@/server/repositories/index.ts";
import { VERIFICATION_CODE_LENGTH } from "@/shared/auth.ts";

/** The codes a user is emailed, one table per use: verifying an email, resetting a password. */
type AccountCodes = typeof EmailVerifications | typeof PasswordResets;

/** How long a code is valid once it's sent. */
const CODE_TTL_MS = 15 * 60 * 1000;
/** The smallest code of its length: its first digit is never 0. */
const LOWEST_CODE = 10 ** (VERIFICATION_CODE_LENGTH - 1);
/** How long after a code is sent before another one may be asked for. */
const RESEND_COOLDOWN_MS = 5 * 60 * 1000;

function generateVerificationCode(): string {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (LOWEST_CODE + (buffer[0] % (9 * LOWEST_CODE))).toString();
}

/** A new code for `userId`, valid for `CODE_TTL_MS`, in place of the one they held, which is archived. */
export async function createCode(tx: Db, codes: AccountCodes, userId: string) {
  await codes.archive(tx, { userId });
  const code = generateVerificationCode();
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  await codes.create(tx, { userId, code, expiresAt });
  return code;
}

/** Whether `userId`'s latest code was sent less than `RESEND_COOLDOWN_MS` ago: too soon to send another. */
export async function hasRecentCode(tx: Db, codes: AccountCodes, userId: string) {
  const latest = await codes.findOne(tx, { userId });
  return !!latest && Date.now() - new Date(latest.createdAt).getTime() < RESEND_COOLDOWN_MS;
}

/**
 * `userId`'s latest code, when it's `code` and hasn't expired. Otherwise refused: `invalid` when they hold none or
 * another one, `expired` when it's past its time, which is checked once the code matched, so it tells nothing of a
 * wrong one.
 */
export async function verifyCode(
  tx: Db,
  codes: AccountCodes,
  userId: string,
  code: string,
  invalid: string,
  expired: string,
) {
  const latest = await codes.findOne(tx, { userId });
  if (!latest || !compareInConstantTime(latest.code, code)) throw new UnauthorizedError(invalid);
  if (new Date(latest.expiresAt) < new Date()) throw new UnauthorizedError(expired);
  return latest;
}
