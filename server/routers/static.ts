import { Hono } from "hono";

const APP_URL = process.env.APP_URL || "http://localhost:8000";

// Helper function to get MIME type based on file extension
function getMimeType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    "html": "text/html",
    "css": "text/css",
    "js": "text/javascript",
    "json": "application/json",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "svg": "image/svg+xml",
    "ico": "image/x-icon",
    "webmanifest": "application/manifest+json",
    "txt": "text/plain",
    "xml": "application/xml",
    "gz": "application/gzip",
    "wasm": "application/wasm",
    "md": "text/markdown; charset=utf-8",
  };

  return mimeTypes[ext || ""] || "application/octet-stream";
}

// --- SEO: Route meta map ---

interface RouteMeta {
  title: string;
  description: string;
}

// Routes that should be crawled and indexed via the SPA shell. Everything else
// (auth-gated app routes, token-gated /share, utility pages like /sign-in) is
// served with a noindex tag — there is no public ruleset view, so /rulesets and
// /rulesets/:id intentionally fall through to noindex. The landing page "/" is
// served from landing.html (never reaches injectMeta), so it isn't listed here.
const INDEXABLE_ROUTE_META: Record<string, RouteMeta> = {
  "/sign-up": {
    title: "Sign Up | Arkyvree",
    description:
      "Create your Arkyvree account and start building characters and campaigns.",
  },
  "/legal": {
    title: "Legal | Arkyvree",
    description:
      "Terms of service and privacy policy for Arkyvree, the programmable ruleset engine and character creator for tabletop RPGs.",
  },
};

// Default values that appear in index.html (used as replacement anchors)
const DEFAULT_TITLE = "Arkyvree | Programmable Ruleset Engine & Character Creator";
const DEFAULT_DESCRIPTION =
  "A programmable ruleset engine and character creator for tabletop RPGs. Customize game rules with modifiers, requirements, and properties, then build characters with real-time validation.";
const DEFAULT_OG_TITLE = "Arkyvree | Programmable Ruleset Engine & Character Creator";
const DEFAULT_OG_DESCRIPTION =
  "A programmable ruleset engine and character creator for tabletop RPGs. Customize rules, build characters, and manage campaigns.";

function injectMeta(html: string, path: string): string {
  const meta = INDEXABLE_ROUTE_META[path];
  if (!meta) {
    // Non-public route (auth-gated app, /share, utility pages): tell crawlers not
    // to index the SPA shell, and strip the empty canonical so there is no
    // self-referential signal pointing at an unindexable URL.
    return html
      .replace('<link rel="canonical" href="" />', "")
      .replace(
        "</head>",
        `    <meta name="robots" content="noindex, nofollow" />\n  </head>`
      );
  }

  let result = html;

  // Replace <title>
  result = result.replace(
    `<title>${DEFAULT_TITLE}</title>`,
    `<title>${meta.title}</title>`
  );

  // Replace meta description
  result = result.replace(
    `content="${DEFAULT_DESCRIPTION}"`,
    `content="${meta.description}"`
  );

  // Replace og:title
  result = result.replace(
    `<meta property="og:title" content="${DEFAULT_OG_TITLE}" />`,
    `<meta property="og:title" content="${meta.title}" />`
  );

  // Replace og:description with route-specific description
  result = result.replace(
    `content="${DEFAULT_OG_DESCRIPTION}"`,
    `content="${meta.description}"`
  );

  // Make og:image absolute
  result = result.replace(
    'content="/og-image.png"',
    `content="${APP_URL}/og-image.png"`
  );

  // Inject og:url and canonical
  result = result.replace(
    '<link rel="canonical" href="" />',
    `<link rel="canonical" href="${APP_URL}${path}" />`
  );
  result = result.replace(
    "</head>",
    `    <meta property="og:url" content="${APP_URL}${path}" />\n  </head>`
  );

  return result;
}

// Cache landing.html template at startup
let cachedLanding: string | null = null;

async function getLandingTemplate(): Promise<string> {
  if (cachedLanding) return cachedLanding;
  const file = Bun.file("./server/landing.html");
  const raw = await file.text();
  cachedLanding = raw.replaceAll("__APP_URL__", APP_URL);
  return cachedLanding;
}

// Cache index.html template at startup
let cachedTemplate: string | null = null;

const APP_CONFIG = JSON.stringify({
  googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  sentryDsn: process.env.SENTRY_CLIENT_DSN || null,
  sentryEnvironment: process.env.NODE_ENV || null,
  sentryRelease: process.env.FLY_MACHINE_VERSION || null,
  featurebaseEnabled: process.env.FEATUREBASE_ENABLED !== "false",
});

async function getTemplate(): Promise<string> {
  if (cachedTemplate) return cachedTemplate;
  const file = Bun.file("./dist/index.html");
  const raw = await file.text();
  cachedTemplate = raw.replace("__APP_CONFIG_JSON__", APP_CONFIG);
  return cachedTemplate;
}

export default new Hono()
  .get("/robots.txt", (c) => {
    return c.text(
      `User-agent: *\nAllow: /\n\nSitemap: ${APP_URL}/sitemap.xml\n`,
      200,
      { "Content-Type": "text/plain", "Cache-Control": "no-cache" }
    );
  })
  .get("/sitemap.xml", (c) => {
    // Only list pages Googlebot can actually render. /rulesets and
    // /rulesets/:id sit behind PrivateRoute (auth) and /sign-in duplicates
    // the landing page's title/description, so none belong in the sitemap.
    const staticUrls = ["/", "/sign-up"];
    const entries = staticUrls
      .map((path) => `  <url><loc>${APP_URL}${path}</loc></url>`)
      .join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>`;
    return c.text(xml, 200, { "Content-Type": "application/xml", "Cache-Control": "public, max-age=900" });
  })
  .get("/llms.txt", async (c) => {
    try {
      const file = Bun.file("./dist/llms.txt");
      const content = await file.text();
      return c.text(content, 200, { "Content-Type": "text/plain", "Cache-Control": "no-cache" });
    } catch {
      return c.text("Not found", 404);
    }
  })
  .get("/public/*", async (c) => {
    // Remove /public prefix to get the actual file path in public directory
    const assetPath = c.req.path.replace(/^\/public\//, "");
    const filePath = `./public/${assetPath}`;

    try {
      const file = Bun.file(filePath);
      const content = await file.arrayBuffer();
      const mimeType = getMimeType(filePath);
      return new Response(content, {
        headers: { "Content-Type": mimeType },
      });
    } catch {
      return c.text("Public asset not found", 404);
    }
  })
  .get("/assets/*", async (c) => {
    const assetPath = c.req.path.replace(/^\/assets\//, "");
    const filePath = `./dist/assets/${assetPath}`;

    try {
      const file = Bun.file(filePath);
      const content = await file.arrayBuffer();
      const mimeType = getMimeType(filePath);
      return new Response(content, {
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    } catch {
      return c.text("Asset not found", 404);
    }
  })
  .get("/:file{.+\\.(js|webmanifest|png|ico|svg|jpg|jpeg|gif|webp|txt|xml|gz|wasm|data|md)$}", async (c) => {
    const filePath = `./dist/${c.req.param("file")}`;
    try {
      const file = Bun.file(filePath);
      if (await file.exists()) {
        const content = await file.arrayBuffer();
        const fileName = c.req.param("file");
        const noCache = /^(sw|registerSW|workbox-).*\.js$/.test(fileName);
        const cacheControl = noCache
          ? "no-cache, no-store, must-revalidate"
          : "public, max-age=3600";
        return new Response(content, {
          headers: {
            "Content-Type": getMimeType(filePath),
            "Cache-Control": cacheControl,
          },
        });
      }
      return c.text("Not found", 404);
    } catch {
      return c.text("Not found", 404);
    }
  })
  .get("/", async (c) => {
    try {
      const html = await getLandingTemplate();
      return new Response(html, {
        headers: { "Content-Type": "text/html", "Cache-Control": "no-cache" },
      });
    } catch (error) {
      console.error("[server] Failed to serve landing.html:", error);
      return c.text("Not Found", 404);
    }
  })
  .get("*", async (c) => {
    // Never serve index.html for requests that look like static files or probe
    // for hidden paths (.git, .env, .aws, etc.)
    if (/\.\w+$/.test(c.req.path) || c.req.path.includes("/.")) {
      return c.text("Not found", 404);
    }
    try {
      const template = await getTemplate();
      const html = injectMeta(template, c.req.path);
      return new Response(html, {
        headers: { "Content-Type": "text/html", "Cache-Control": "no-cache" },
      });
    } catch (error) {
      console.error("[server] Failed to serve index.html:", error);
      return c.text("Not Found", 404);
    }
  });
