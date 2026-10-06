import type { InferResponseType } from "hono/client";

import type { rpc } from "@/client/src/services/rpc.ts";

type MeResponse = InferResponseType<typeof rpc.auth.me.$get, 200>;

export type AuthUser = Pick<
  MeResponse,
  "id" | "emailAddress" | "username" | "pendingEmailAddress" | "onboardingCompletedAt" | "expiresAt"
>;

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
