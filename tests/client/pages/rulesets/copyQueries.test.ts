import { describe, expect, test } from "bun:test";

import { QueryClient } from "@tanstack/react-query";

import { QUERY_KEYS } from "@/client/src/lib/queryKeys.ts";
import { seedCopyQueries } from "@/client/src/pages/rulesets/copyQueries.ts";

const COPY = "copy";
const RULESET = "ruleset";
const SOURCE = "source";

/** A query of the source that's still fetching: its fetch resolves once `answer` is called. */
function fetchingSource(client: QueryClient, queryKey: readonly unknown[]) {
  let answer: (data: string[]) => void = () => undefined;
  const fetched = client.fetchQuery({
    queryKey,
    queryFn: () => new Promise<string[]>((resolve) => (answer = resolve)),
    staleTime: 0,
  });
  return { answer: (data: string[]) => answer(data), fetched };
}

/** A client whose cached queries go stale only when told, as the app's do for five minutes. */
function newClient() {
  return new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
}

describe("a copy-on-write's queries, seeded with its source's", () => {
  test("caches every query of the ruleset naming the source under the copy's id, stale", () => {
    const client = newClient();
    client.setQueryData(QUERY_KEYS.rulesets.ownerDetail(RULESET, SOURCE), { name: "Bard" });
    client.setQueryData(QUERY_KEYS.rulesets.ownerTable(RULESET, SOURCE, "spells"), ["Cantrips"]);
    client.setQueryData(QUERY_KEYS.rulesets.customization(RULESET, "feats", SOURCE, "modifiers"), ["+2 Strength"]);

    seedCopyQueries(client, RULESET, SOURCE, COPY);

    for (const [key, data] of [
      [QUERY_KEYS.rulesets.ownerDetail(RULESET, COPY), { name: "Bard" }],
      [QUERY_KEYS.rulesets.ownerTable(RULESET, COPY, "spells"), ["Cantrips"]],
      [QUERY_KEYS.rulesets.customization(RULESET, "feats", COPY, "modifiers"), ["+2 Strength"]],
    ] as const) {
      expect(client.getQueryData<unknown>(key)).toEqual(data);
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });

  test("keeps what the copy already holds: its save's row", () => {
    const client = newClient();
    client.setQueryData(QUERY_KEYS.rulesets.entity(RULESET, "languages", SOURCE), { name: "Abyssal" });
    client.setQueryData(QUERY_KEYS.rulesets.entity(RULESET, "languages", COPY), { name: "Abyssal 2" });

    seedCopyQueries(client, RULESET, SOURCE, COPY);

    expect(client.getQueryData<unknown>(QUERY_KEYS.rulesets.entity(RULESET, "languages", COPY))).toEqual({
      name: "Abyssal 2",
    });
    expect(client.getQueryState(QUERY_KEYS.rulesets.entity(RULESET, "languages", COPY))?.isInvalidated).toBe(false);
  });

  test("leaves another fork's queries of the same inherited entity, and the ruleset's other queries", () => {
    const client = newClient();
    client.setQueryData(QUERY_KEYS.rulesets.ownerDetail("other fork", SOURCE), { name: "Bard" });
    client.setQueryData(QUERY_KEYS.rulesets.section(RULESET, "classes"), ["Bard"]);

    seedCopyQueries(client, RULESET, SOURCE, COPY);

    expect(client.getQueryData<unknown>(QUERY_KEYS.rulesets.ownerDetail("other fork", COPY))).toBeUndefined();
    expect(
      client
        .getQueryCache()
        .findAll()
        .map((query) => query.queryKey),
    ).toEqual([QUERY_KEYS.rulesets.ownerDetail("other fork", SOURCE), QUERY_KEYS.rulesets.section(RULESET, "classes")]);
  });

  test("lands what a source's fetch still in flight answers on the copy", async () => {
    const client = newClient();
    const key = QUERY_KEYS.rulesets.customization(RULESET, "feats", SOURCE, "modifiers");
    client.setQueryData(key, ["+2 Strength"]);
    const source = fetchingSource(client, key);

    seedCopyQueries(client, RULESET, SOURCE, COPY);
    source.answer(["+2 Strength", "+1 Dexterity"]);
    await source.fetched;

    const copyKey = QUERY_KEYS.rulesets.customization(RULESET, "feats", COPY, "modifiers");
    expect(client.getQueryData<unknown>(copyKey)).toEqual(["+2 Strength", "+1 Dexterity"]);
    expect(client.getQueryState(copyKey)?.isInvalidated).toBe(true);
  });

  test("never lands a source's fetch over the copy's own rows", async () => {
    const client = newClient();
    const key = QUERY_KEYS.rulesets.customization(RULESET, "feats", SOURCE, "modifiers");
    client.setQueryData(key, ["+2 Strength"]);
    const source = fetchingSource(client, key);

    seedCopyQueries(client, RULESET, SOURCE, COPY);
    const copyKey = QUERY_KEYS.rulesets.customization(RULESET, "feats", COPY, "modifiers");
    await client.fetchQuery({ queryKey: copyKey, queryFn: () => ["the copy's own"], staleTime: 0 });
    source.answer(["the source's"]);
    await source.fetched;

    expect(client.getQueryData<unknown>(copyKey)).toEqual(["the copy's own"]);
  });

  test("stops listening once a source's query fetching is gone", () => {
    const client = newClient();
    const key = QUERY_KEYS.rulesets.ownerDetail(RULESET, SOURCE);
    client.setQueryData(key, { name: "Bard" });
    void fetchingSource(client, key).fetched.catch(() => undefined);
    const listening = client.getQueryCache().hasListeners();

    seedCopyQueries(client, RULESET, SOURCE, COPY);
    expect(client.getQueryCache().hasListeners()).toBe(true);
    client.removeQueries({ queryKey: key, exact: true });

    expect(client.getQueryCache().hasListeners()).toBe(listening);
    expect(client.getQueryData<unknown>(QUERY_KEYS.rulesets.ownerDetail(RULESET, COPY))).toEqual({ name: "Bard" });
  });

  test("seeds nothing the source hasn't loaded", () => {
    const client = newClient();
    void fetchingSource(client, QUERY_KEYS.rulesets.ownerDetail(RULESET, SOURCE));

    seedCopyQueries(client, RULESET, SOURCE, COPY);

    expect(client.getQueryState(QUERY_KEYS.rulesets.ownerDetail(RULESET, COPY))).toBeUndefined();
  });
});
