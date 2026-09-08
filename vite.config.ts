import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createLogger, defineConfig, loadEnv, type UserConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
const apiPort = process.env.API_PORT || "8000";

// Filter out the noisy /ws-proxy disconnect lines vite emits when a
// playwright tab tears down: "ws proxy error: ... ECONNRESET" and
// "ws proxy socket error: ... ECONNRESET". They are expected on
// abrupt client disconnect, not actionable, and clutter the test
// log. Anything else still surfaces normally.
// https://github.com/vitejs/vite/issues/2974
// https://github.com/vitejs/vite/issues/4794
const filteredLogger = createLogger();
const originalError = filteredLogger.error.bind(filteredLogger);
filteredLogger.error = (msg, options) => {
  if (/ws proxy (?:error|socket error)|ECONNRESET|EPIPE/.test(msg)) return;
  originalError(msg, options);
};

const baseConfig: UserConfig = {
  root: "./client",
  customLogger: filteredLogger,
  envDir: path.resolve(__dirname),
  publicDir: path.resolve(__dirname, "./public"),
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react-dom/") || id.includes("node_modules/react/")) {
            return "vendor-react";
          }
          if (id.includes("node_modules/@mui/")) {
            return "vendor-mui";
          }
          if (id.includes("node_modules/@tanstack/")) {
            return "vendor-query";
          }
        },
      },
    },
  },
  plugins: [
    {
      name: "application-license",
      apply: "build",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "LICENSE.txt",
          source: readFileSync(path.resolve(__dirname, "LICENSE"), "utf8"),
        });
      },
    },
    {
      name: "inject-app-config",
      apply: "serve",
      transformIndexHtml(html) {
        const env = loadEnv("development", path.resolve(__dirname), "");
        // Process env wins over .env files so tooling (e.g. playwright)
        // can flip FEATUREBASE_ENABLED=false at the command line without
        // needing to mutate the .env files vite reads from disk.
        const featurebaseRaw = process.env.FEATUREBASE_ENABLED ?? env.FEATUREBASE_ENABLED;
        const config = JSON.stringify({
          googleClientId: env.GOOGLE_CLIENT_ID || null,
          sentryDsn: env.SENTRY_CLIENT_DSN || null,
          sentryEnvironment: env.NODE_ENV || null,
          sentryRelease: null,
          featurebaseEnabled: featurebaseRaw !== "false",
        });
        return html.replace("__APP_CONFIG_JSON__", config);
      },
    },
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        // Only precache hashed JS/CSS — they have content-hash filenames so
        // there is zero staleness risk.  HTML is NOT precached: navigation
        // requests hit the network so the server always returns the latest
        // index.html (with the correct asset references and SEO meta).
        globPatterns: ["**/*.{js,css}"],
        // Override vite-plugin-pwa default ("index.html") — without this the
        // SW registers a NavigationRoute that serves a precached index.html,
        // which goes stale between deploys.
        navigateFallback: undefined,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: "Arkyvree",
        short_name: "Arkyvree",
        description: "RPG character generator and campaign manager",
        theme_color: "#8d1e1e",
        background_color: "#2a251e",
        display: "standalone",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Ensure Vite uses the correct React installation, not Next.js's bundled version
      "react": path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
    extensions: [".js", ".jsx", ".ts", ".tsx"],
  },
  server: {
    port: 5173,
    hmr: {
      overlay: true,
      port: 5174,
    },
    host: true,
    proxy: {
      "^/api/.*": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
      "^/auth/.*": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
      "/ws": {
        target: `http://localhost:${apiPort}`,
        ws: true,
      },
    },
  },
};

export default defineConfig(baseConfig);
