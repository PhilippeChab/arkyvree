import { defineConfig } from "drizzle-kit";
import process from "node:process";

export default defineConfig({
  out: "./drizzle",
  schema: "./drizzle/schema.ts",
  dialect: "postgresql",
  schemaFilter: ["public", "campaign", "customization", "account", "rules", "character", "storage"],
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
