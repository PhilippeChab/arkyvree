import type { InferResponseType } from "hono/client";

import type { rpc } from "@/client/src/services/rpc.ts";
import { isRecord } from "@/shared/isRecord.ts";

type MeResponse = InferResponseType<typeof rpc.auth.me.$get, 200>;

export type AuthUser = Pick<
  MeResponse,
  "id" | "emailAddress" | "username" | "pendingEmailAddress" | "onboardingCompletedAt" | "expiresAt"
>;

/** A text field as storage held it: its text, or none. */
function textOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

/** A user as storage held it, when it's one: the fields the store keeps, each of its type; anything else is none. */
export function readAuthUser(value: unknown): AuthUser | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.emailAddress !== "string") return null;
  return {
    id: value.id,
    emailAddress: value.emailAddress,
    username: textOrNull(value.username),
    pendingEmailAddress: textOrNull(value.pendingEmailAddress),
    onboardingCompletedAt: textOrNull(value.onboardingCompletedAt),
    expiresAt: textOrNull(value.expiresAt),
  };
}

/** The fields the store keeps (and persists) from a user response, whatever else it carries. */
export function toAuthUser({
  id,
  emailAddress,
  username,
  pendingEmailAddress,
  onboardingCompletedAt,
  expiresAt,
}: AuthUser): AuthUser {
  return {
    id,
    emailAddress,
    username,
    pendingEmailAddress,
    onboardingCompletedAt,
    expiresAt,
  };
}
