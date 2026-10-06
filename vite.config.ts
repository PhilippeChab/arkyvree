import { readFileSync } from "node:fs";
import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type UserConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { createQuietLogger } from "./scripts/vite/quietLogger.ts";

const apiPort = process.env.API_PORT || "8000";

const filteredLogger = createQuietLogger();

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
        const config = JSON.stringify({
          googleClientId: env.GOOGLE_CLIENT_ID || null,
          sentryDsn: env.SENTRY_CLIENT_DSN || null,
          sentryEnvironment: env.NODE_ENV || null,
          sentryRelease: null,
        });
        return html.replace("__APP_CONFIG_JSON__", config);
      },
    },
    react(),
    VitePWA({
      // The e2e coverage build inlines its source maps, which puts the chunks past the precache limit; its runs
      // block service workers anyway.
      disable: process.env.E2E_COVERAGE === "1",
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
      react: path.resolve(__dirname, "node_modules/react"),
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
