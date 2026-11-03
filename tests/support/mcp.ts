import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

import { application } from "@/server/routers/application.ts";

/** A tool's result, as the MCP client answers it. */
type ToolResult = Awaited<ReturnType<Client["callTool"]>>;

/** The MCP server's address, as a client connects to it: the app answers it in the test's process. */
const MCP_URL = new URL("http://localhost/mcp");

/** A tool's result's text: its one text content. */
function readText(result: ToolResult) {
  const [content] = result.content as { text?: string; type: string }[];
  if (content?.type !== "text" || content.text === undefined) throw new Error("The tool answered no text");
  return content.text;
}

/** A tool's result's text, refused unless the tool answered what it did (no `isError`). */
export async function callTool(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ arguments: args, name });
  if (result.isError) throw new Error(`The tool ${name} refused: ${readText(result)}`);
  return readText(result);
}

/** A tool's refusal's text, refused unless the tool refused (`isError`). */
export async function callToolRefused(client: Client, name: string, args: Record<string, unknown>) {
  const result = await client.callTool({ arguments: args, name });
  if (!result.isError) throw new Error(`The tool ${name} answered instead of refusing: ${readText(result)}`);
  return readText(result);
}

/**
 * An MCP client connected to the app's server with `token` (an API key's), as Claude Code connects with one: by the
 * 2025 handshake, as today's clients do, or by the 2026 protocol's, which has none (`modern`).
 */
export async function connectMcp(token: string, { modern = false } = {}) {
  const versionNegotiation = modern ? { mode: { pin: "2026-07-28" } } : undefined;
  const client = new Client({ name: "arkyvree-tests", version: "1" }, { versionNegotiation });
  const transport = new StreamableHTTPClientTransport(MCP_URL, {
    fetch: async (input, init) => await application.request(input instanceof URL ? input.href : input, init),
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}
