import { Hono } from "hono";

import { OAUTH_SCOPES, readIssuer, readResource } from "@/server/oauthIssuer.ts";

/**
 * The MCP server's protected resource metadata (RFC 9728): what it is, and who signs an app in to it. An app reads it
 * where the MCP server's 401 points (`WWW-Authenticate`), or at its well-known place.
 */
function toProtectedResource() {
  return {
    authorization_servers: [readIssuer()],
    bearer_methods_supported: ["header"],
    resource: readResource(),
    resource_name: "Arkyvree",
    scopes_supported: [...OAUTH_SCOPES],
  };
}

/**
 * What an app reads to sign in to the MCP server with OAuth (`/oauth/…`), each at its well-known place: the server's
 * protected resource metadata, and its authorization server's (RFC 8414). An app names itself by its Client ID Metadata
 * Document's URL (CIMD), which the server fetches: it registers nothing first.
 */
export default new Hono()
  .get("/oauth-authorization-server", (c) => {
    const issuer = readIssuer();
    return c.json(
      {
        authorization_endpoint: `${issuer}/oauth/authorize`,
        authorization_response_iss_parameter_supported: true,
        client_id_metadata_document_supported: true,
        code_challenge_methods_supported: ["S256"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        issuer,
        response_types_supported: ["code"],
        revocation_endpoint: `${issuer}/oauth/revoke`,
        revocation_endpoint_auth_methods_supported: ["none"],
        scopes_supported: [...OAUTH_SCOPES],
        token_endpoint: `${issuer}/oauth/token`,
        token_endpoint_auth_methods_supported: ["none"],
      },
      200,
    );
  })
  .get("/oauth-protected-resource", (c) => c.json(toProtectedResource(), 200))
  .get("/oauth-protected-resource/mcp", (c) => c.json(toProtectedResource(), 200));
