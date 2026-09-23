import { z } from "zod";
import { test, expect } from "@/tests/e2e/fixtures.ts";
import { signIn } from "@/tests/e2e/helpers.ts";

test("concurrent first edits preserve every property on one fork copy", async ({ page, ownerUser }) => {
  await signIn(page, ownerUser.email, ownerUser.password);
  await page.goto("/rulesets?search=Core%20SRD%203.5");
  await page.locator('h6:has-text("Core SRD 3.5")').first().click();
  const baseId = page.url().match(/\/rulesets\/([a-f0-9-]+)/)?.[1];
  expect(baseId).toBeTruthy();

  const forkName = `Concurrent COW ${Date.now()}`;
  await page.locator('[data-testid="MoreVertIcon"]').first().click();
  await page.getByRole("menuitem", { name: /^Fork\b/ }).click();
  const dialog = page.getByRole("dialog", { name: "Fork Ruleset" });
  await dialog.locator('input[name="name"]').fill(forkName);
  await dialog.getByRole("button", { name: /Fork Ruleset/ }).click();
  await expect(page.getByRole("heading", { name: forkName })).toBeVisible();
  await page.getByRole("tab", { name: "Races" }).click();
  await page.getByText("Human", { exact: true }).first().click();
  await expect(page).toHaveURL(/\/races\/[a-f0-9-]+\/customization/);
  const ids = page.url().match(/\/rulesets\/([a-f0-9-]+)\/races\/([a-f0-9-]+)/);
  expect(ids).toBeTruthy();
  const [, forkId, sourceId] = ids!;
  const propertiesUrl = (rulesetId: string, entityId: string) =>
    `/api/rulesets/${rulesetId}/customization/races/${entityId}/properties`;
  const parentBefore = await page.request.get(propertiesUrl(baseId!, sourceId));
  expect(parentBefore.ok()).toBe(true);
  const parentProperties: unknown = await parentBefore.json();

  // Independent HTTP requests use separate database transactions. The burst
  // exercises the first-copy window that single-transaction unit tests miss.
  const types = Array.from({ length: 8 }, (_, index) => `CONCURRENT_COW_${index}`);
  const responses = await Promise.all(types.map(type => page.request.post(propertiesUrl(forkId, sourceId), {
    data: { type, value: "1" },
  })));
  const copiedIds = new Set<string>();
  for (const response of responses) {
    expect(response.status(), await response.text()).toBe(201);
    copiedIds.add(z.object({ resolvedEntityId: z.string().uuid() }).parse(await response.json()).resolvedEntityId);
  }
  expect(copiedIds.size).toBe(1);
  const [copyId] = [...copiedIds];
  expect(copyId).not.toBe(sourceId);
  const properties = await page.request.get(propertiesUrl(forkId, copyId));
  expect(properties.ok()).toBe(true);
  const rows = z.array(z.object({ type: z.string() })).parse(await properties.json());
  for (const type of types) expect(rows.filter(row => row.type === type)).toHaveLength(1);
  const parentAfter = await page.request.get(propertiesUrl(baseId!, sourceId));
  expect(parentAfter.ok()).toBe(true);
  expect(await parentAfter.json()).toEqual(parentProperties);
});
