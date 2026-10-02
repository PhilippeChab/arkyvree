import { describe, expect, test } from "bun:test";

import { assertLocalDatabase, cloneDatabase, databaseOf, withDatabase } from "@/scripts/db/clone-database.ts";
import resetDatabase from "@/scripts/db/reset.ts";

const LOCAL = "postgresql://dev:secret@localhost:5433/arkyvree_test?sslmode=disable";

describe("A database URL", () => {
  test("names its server and database, and another database on the same server", () => {
    expect(databaseOf(LOCAL)).toEqual({ server: "postgresql://dev:secret@localhost:5433", name: "arkyvree_test" });
    expect(withDatabase(LOCAL, "arkyvree_test_w1")).toBe(
      "postgresql://dev:secret@localhost:5433/arkyvree_test_w1?sslmode=disable",
    );
  });
});

describe("A script that drops databases or tables", () => {
  test("runs only on a local server", () => {
    for (const host of ["localhost:5433", "127.0.0.1", "[::1]:5432"]) {
      expect(() => assertLocalDatabase(`postgresql://u:p@${host}/db`, "reset")).not.toThrow();
    }
    expect(() => assertLocalDatabase("postgresql://u:p@ep-x.neon.tech/arkyvreedb", "reset")).toThrow(
      "ep-x.neon.tech isn't a local database server: only a local database is reset",
    );
  });

  test("resets only a local development or test database, before touching anything", async () => {
    const url = process.env.DATABASE_URL;
    try {
      process.env.DATABASE_URL = "postgresql://u:p@ep-x.neon.tech/arkyvree_test";
      await expect(resetDatabase(false)).rejects.toThrow("isn't a local database server");
      // Production through a tunnel: on localhost, but not named as a development or test database
      process.env.DATABASE_URL = "postgresql://u:p@localhost:5433/arkyvreedb";
      await expect(resetDatabase(false)).rejects.toThrow("arkyvreedb isn't a development or test database");
    } finally {
      process.env.DATABASE_URL = url;
    }
  });

  test("copies only a local test database, into databases named after it", async () => {
    await expect(cloneDatabase("postgresql://u:p@db.example.com/arkyvree_test", ["arkyvree_test_w1"])).rejects.toThrow(
      "isn't a local database server",
    );
    await expect(cloneDatabase("postgresql://u:p@localhost/arkyvree_dev", ["arkyvree_dev_w1"])).rejects.toThrow(
      "arkyvree_dev isn't a test database",
    );
    await expect(cloneDatabase("postgresql://u:p@localhost/arkyvree_test", ["arkyvree_prod"])).rejects.toThrow(
      "not arkyvree_prod",
    );
    await expect(
      cloneDatabase("postgresql://u:p@localhost/arkyvree_test", [`arkyvree_test_${"x".repeat(60)}`]),
    ).rejects.toThrow("in 63 characters");
  });
});
