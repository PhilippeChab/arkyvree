import pg from "pg";

/** Runs `sql` on the run's database, for what the API has no way to do: its rows. */
export async function queryDatabase<Row extends pg.QueryResultRow>(sql: string, params: unknown[]): Promise<Row[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<Row>(sql, params)).rows;
  } finally {
    await client.end();
  }
}
