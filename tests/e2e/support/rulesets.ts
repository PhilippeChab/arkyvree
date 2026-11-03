import { expect, type Page } from "@playwright/test";
import { parseResponse } from "hono/client";

import { apiOf } from "./api.ts";
import { apiResponse } from "./page.ts";

/** The core rules' id. */
export async function coreRulesetId(page: Page) {
  const { items } = await parseResponse(
    apiOf(page).api.rulesets.$get({ query: { scope: "base", search: "Core SRD 3.5" } }),
  );
  const core = items.find((ruleset) => ruleset.name === "Core SRD 3.5");
  if (!core) throw new Error("Core SRD 3.5 isn't seeded");
  return core.id;
}

/** Forks the core rules through the API, and opens the fork's page. Returns the fork's id. */
export async function forkCoreRuleset(page: Page, name: string) {
  const fork = await parseResponse(
    apiOf(page).api.rulesets[":id"].fork.$post({
      param: { id: await coreRulesetId(page) },
      json: { name, description: "", private: false },
    }),
  );
  await page.goto(`/rulesets/${fork.id}`);
  await expect(page.getByRole("heading", { name })).toBeVisible({ timeout: 10_000 });
  return fork.id;
}

/** Renames the entity whose customization page is open, and waits for the save. */
export async function renameEntity(page: Page, name: string) {
  await page.getByLabel("Name", { exact: true }).first().fill(name);
  const saved = apiResponse(page, "PUT", /\/api\/rulesets\/[a-f0-9-]+\/entities\/[^/]+\/[a-f0-9-]+/);
  await page
    .locator("form")
    .filter({ has: page.getByLabel("Name") })
    .first()
    .getByRole("button", { name: /^Save$/ })
    .click();
  await saved;
}

/** Keep Core SRD reachable when forks push it beyond the first results page. */
export async function visitCoreRulesetList(page: Page) {
  await page.goto("/rulesets?search=Core%20SRD%203.5");
}
