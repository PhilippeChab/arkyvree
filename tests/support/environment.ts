/** The environment a test runs the app under, as an instance set up otherwise would: each change put back after. */

/**
 * Runs `run` with the variables `env` sets (one set to undefined is unset), each put back as it was after, whatever
 * `run` does: the server reads its environment when it asks for a variable (`server/environment.ts`), so it sees them.
 */
export async function withEnvironment<T>(env: Record<string, string | undefined>, run: () => Promise<T>) {
  const before = Object.fromEntries(Object.keys(env).map((name) => [name, process.env[name]]));
  const assign = (values: Record<string, string | undefined>) => {
    for (const [name, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
  assign(env);
  try {
    return await run();
  } finally {
    assign(before);
  }
}
