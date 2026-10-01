import process from "node:process";

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./drizzle/schema.ts",
  dialect: "postgresql",
  schemaFilter: ["public", "campaign", "customization", "account", "rules", "character", "storage"],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
