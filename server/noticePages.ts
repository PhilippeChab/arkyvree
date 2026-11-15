import Shutdown from "./Shutdown.ts";

/** Escapes text for the page's HTML: the problem names settings and their values, as their owner typed them. */
function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/** A notice page: its title, and its paragraphs' HTML. */
function renderPage(title: string, paragraphs: string[]) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Arkyvree: ${title}</title>
<style>
body { font-family: system-ui, sans-serif; max-width: 40rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5;
  color: #2a251e; background: #f4efe6; }
h1 { font-size: 1.5rem; color: #8d1e1e; }
code { background: #ebe4d6; padding: 0.1rem 0.3rem; border-radius: 0.2rem; }
</style>
</head>
<body>
<h1>${title}</h1>
${paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join("\n")}
</body>
</html>
`;
}

/**
 * Serves a notice page (`page`) on every path but the probes, `/up` and `/health`, which answer 200 so ONCE keeps the
 * container; everything else answers 503 (`retryAfter` seconds, when given). It reads no database and runs nothing else.
 */
function startNoticePage(
  page: string,
  { hostname, port, retryAfter }: { hostname: string; port: number; retryAfter?: number },
) {
  const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8" };
  if (retryAfter) headers["Retry-After"] = String(retryAfter);
  const server = Bun.serve({
    port,
    hostname,
    fetch(request) {
      const { pathname } = new URL(request.url);
      if (pathname === "/up" || pathname === "/health") return new Response("notice", { status: 200 });
      return new Response(page, { status: 503, headers });
    },
  });
  Shutdown.onSignal("server", async () => {
    await server.stop(true);
  });
  return server;
}

/**
 * The page a self-hosted install answers while its email setup is pending (`findPendingEmailSetup`'s problem): what to
 * do, and what's missing.
 */
export function startEmailSetupPage(problem: string, address: { hostname: string; port: number }) {
  const page = renderPage("Arkyvree can't send email yet", [
    "Arkyvree sends a code to confirm each new account's address, and emails invites and password resets, so it needs " +
      "a mail provider before anyone can sign up.",
    "Open ONCE's settings, then <strong>Email</strong>, and enter your mail provider's SMTP details. Arkyvree restarts " +
      "with them. Without ONCE, set <code>SMTP_ADDRESS</code>, <code>SMTP_PORT</code>, <code>SMTP_USERNAME</code>, " +
      "<code>SMTP_PASSWORD</code> and <code>MAILER_FROM_ADDRESS</code> on the container, and restart it.",
    `What's missing: ${escapeHtml(problem)}`,
  ]);
  const server = startNoticePage(page, address);
  console.warn(`[server] ${problem}`);
  console.warn(`[server] Email isn't set up: answering the setup page at ${server.url} until it is`);
  return server;
}

/**
 * The page a new version of a self-hosted install answers while the version it replaces still runs on the same volume
 * (docker/entrypoint.sh waits for it to stop, then starts the app): ONCE starts the new one, waits for its `/up`, then
 * removes the old one.
 */
export function startUpdatingPage(address: { hostname: string; port: number }) {
  const page = renderPage("Arkyvree is updating", ["It's back in a moment: reload this page shortly."]);
  const server = startNoticePage(page, { ...address, retryAfter: 10 });
  console.log(`[server] Answering the updating page at ${server.url} while the previous version stops`);
  return server;
}
