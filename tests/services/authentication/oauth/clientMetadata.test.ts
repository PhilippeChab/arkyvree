import { describe, expect, test } from "bun:test";

import {
  isPublicAddress,
  isRedirectAllowed,
  parseClientId,
  readClientDocument,
  readLimited,
} from "@/server/services/authentication/oauth/clientMetadata.ts";

describe("clientMetadata", () => {
  test("takes an app's client id as an https URL with a path, no credentials nor fragment", () => {
    expect(parseClientId("https://claude.ai/oauth/claude-code-client-metadata")?.host).toBe("claude.ai");
    for (const id of [
      "http://app.example/client.json",
      "https://app.example/",
      "https://u:p@app.example/c",
      "https://app.example/c#x",
      "not a url",
    ])
      expect(parseClientId(id)).toBeUndefined();
  });

  test("fetches no private, loopback or link-local address", () => {
    for (const address of [
      "10.1.2.3",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.0.1",
      "192.168.1.1",
      "100.64.0.1",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:10.0.0.1",
    ])
      expect(isPublicAddress(address)).toBe(false);
    for (const address of ["8.8.8.8", "160.79.104.10", "2606:4700::1111"]) expect(isPublicAddress(address)).toBe(true);
  });

  test("takes a listed redirect URI, and a loopback one on any port", () => {
    const listed = [
      "https://claude.ai/api/mcp/auth_callback",
      "http://localhost/callback",
      "http://127.0.0.1/callback",
    ];
    expect(isRedirectAllowed(listed, "https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isRedirectAllowed(listed, "http://localhost:3118/callback")).toBe(true);
    expect(isRedirectAllowed(listed, "http://127.0.0.1:50000/callback")).toBe(true);
    for (const uri of [
      "https://claude.ai/api/mcp/other",
      "http://localhost:3118/elsewhere",
      "https://localhost:3118/callback",
      "http://evil.example/callback",
    ])
      expect(isRedirectAllowed(listed, uri)).toBe(false);
  });

  test("reads Claude Code's and ChatGPT's documents as they publish them", () => {
    const claudeCode = new URL("https://claude.ai/oauth/claude-code-client-metadata");
    expect(
      readClientDocument(claudeCode, {
        client_id: claudeCode.href,
        client_name: "Claude Code",
        grant_types: ["authorization_code", "refresh_token"],
        redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"],
        token_endpoint_auth_method: "none",
      }),
    ).toEqual({ name: "Claude Code", redirectUris: ["http://localhost/callback", "http://127.0.0.1/callback"] });
    // ChatGPT's offers a signed assertion too, but takes none where the server takes none alone
    const chatGpt = new URL("https://chatgpt.com/oauth/client.json");
    expect(
      readClientDocument(chatGpt, {
        client_id: chatGpt.href,
        client_name: "ChatGPT",
        jwks_uri: "https://chatgpt.com/oauth/jwks.json",
        redirect_uris: ["https://chatgpt.com/connector_platform_oauth_redirect"],
        token_endpoint_auth_method: "private_key_jwt",
        token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
      }),
    ).toEqual({ name: "ChatGPT", redirectUris: ["https://chatgpt.com/connector_platform_oauth_redirect"] });
  });

  test("reads an app's document only when it names itself by its URL", () => {
    const url = new URL("https://app.example/oauth/client.json");
    const document = { client_id: url.href, client_name: "  App  ", redirect_uris: ["https://app.example/callback"] };
    expect(readClientDocument(url, document)).toEqual({ name: "App", redirectUris: ["https://app.example/callback"] });
    expect(readClientDocument(url, { ...document, client_name: undefined })?.name).toBe("app.example");
    expect(readClientDocument(url, { ...document, client_id: "https://other.example/client.json" })).toBeUndefined();
    expect(readClientDocument(url, { ...document, redirect_uris: [] })).toBeUndefined();
  });

  test("takes no redirect URI but an https one, or an http one to the user's device: never a script's", () => {
    const url = new URL("https://evil.example/client.json");
    for (const uri of [
      "javascript:alert(document.cookie)//",
      "data:text/html,<script>1</script>",
      "http://evil.example/callback",
      "file:///etc/passwd",
    ]) {
      expect(readClientDocument(url, { client_id: url.href, redirect_uris: [uri] })).toBeUndefined();
      expect(isRedirectAllowed([uri], uri)).toBe(false);
    }
  });

  test("fetches no multicast, reserved, site-local or NAT64 address", () => {
    for (const address of ["224.0.0.1", "240.0.0.1", "255.255.255.255", "fec0::1", "ff02::1", "64:ff9b::7f00:1"])
      expect(isPublicAddress(address)).toBe(false);
  });

  test("reads a body to its bound at most, whatever length its server says", async () => {
    const streamOf = (sizes: number[]) =>
      new ReadableStream<Uint8Array>({
        start(controller) {
          for (const size of sizes) controller.enqueue(new Uint8Array(size).fill(65));
          controller.close();
        },
      });
    expect(await readLimited(streamOf([10, 10]), 20)).toBe("A".repeat(20));
    expect(await readLimited(streamOf([10, 10, 1]), 20)).toBeUndefined();
  });
});
