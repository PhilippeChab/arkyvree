/** The error codes an OAuth endpoint answers (RFC 6749 section 5.2, RFC 8707's `invalid_target`). */
export type OAuthErrorCode =
  | "invalid_client"
  | "invalid_grant"
  | "invalid_request"
  | "invalid_target"
  | "unsupported_grant_type";

/**
 * A refusal of the token endpoint, answered as OAuth answers it (`{ error, error_description }`), never in the app's
 * envelope: an app reads `invalid_grant` to sign in again.
 */
export class OAuthError extends Error {
  constructor(
    readonly code: OAuthErrorCode,
    readonly description: string,
    readonly status: 400 | 401 = 400,
  ) {
    super(description);
  }
}
