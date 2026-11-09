import { resolve } from "node:path";

import dotenv from "dotenv";

import { databaseOf, withDatabase } from "@/scripts/db/databases.ts";

/**
 * Sets up the e2e run's environment, and returns its port. It reads `.env.test`, then:
 * - the server the run starts listens on a port of its own (`E2E_PORT`, 8010 by default): the API, its websocket, and
 *   the built client, served as in production;
 * - the run has a database of its own: a copy, made when its server starts, of the e2e template, which `bun run
 *   test:db:reset` copies from the seeded test database. So a run never locks the unit tests' database, nor holds what
 *   another run writes: runs on other ports have other copies. Its name keeps "test", which turns off the rate limits.
 *   The workers re-read the config with the environment it sets: only the first read derives the names;
 * - the websocket listener prefers a direct URL: it must listen on the run's database too;
 * - the run has an object storage of its own (`E2E_STORAGE_PORT`, five past its port): a stand-in the run starts
 *   (`tests/fixtures/storageServer.ts`), where its server stores the files a journey uploads, since `.env.test` names
 *   no working storage.
 */
export function prepareE2eEnvironment() {
  dotenv.config({ path: resolve(process.cwd(), ".env.test") });
  const port = process.env.E2E_PORT ?? "8010";
  process.env.PORT = port;
  process.env.E2E_BASE_URL = process.env.APP_URL = `http://localhost:${port}`;
  process.env.TEMPLATE_DATABASE_URL ??= withDatabase(
    process.env.DATABASE_URL!,
    `${databaseOf(process.env.DATABASE_URL!).name}_e2e`,
  );
  process.env.DATABASE_URL = withDatabase(
    process.env.TEMPLATE_DATABASE_URL,
    `${databaseOf(process.env.TEMPLATE_DATABASE_URL).name}_${port}`,
  );
  process.env.DIRECT_DATABASE_URL = process.env.DATABASE_URL;
  process.env.E2E_STORAGE_PORT ??= String(Number(port) + 5);
  process.env.S3_ENDPOINT = `http://127.0.0.1:${process.env.E2E_STORAGE_PORT}`;
  return port;
}
