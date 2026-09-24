import { Pool } from "pg";
import { z } from "zod";
import { test, expect } from "@/tests/e2e/fixtures.ts";
import { signIn, visitCoreRulesetList } from "@/tests/e2e/helpers.ts";

for (const operation of ["delete", "revert"] as const) {
  for (const kind of ["properties", "requirements", "modifiers"] as const) {
    test(`${kind} creation racing ${operation} leaves no orphan customization`, async ({ page, ownerUser }) => {
      await signIn(page, ownerUser.email, ownerUser.password);
      await visitCoreRulesetList(page);
      await page.locator('h6:has-text("Core SRD 3.5")').first().click();
      const baseId = page.url().match(/\/rulesets\/([a-f0-9-]+)/)?.[1];
      expect(baseId).toBeTruthy();
      await page.getByRole("tab", { name: "Races" }).click();
      await page.getByText("Human", { exact: true }).first().click();
      await expect(page).toHaveURL(/\/races\/[a-f0-9-]+\/customization/);
      const sourceId = page.url().match(/\/races\/([a-f0-9-]+)/)![1];
      const fork = await page.request.post(`/api/rulesets/${baseId}/fork`, {
        data: { name: `Delete race ${operation} ${kind} ${Date.now()}`, description: "Concurrency regression", private: true },
      });
      expect(fork.status(), await fork.text()).toBe(201);
      const forkId = z.object({ id: z.string().uuid() }).parse(await fork.json()).id;
      const customization = (id: string, type: string) => `/api/rulesets/${forkId}/customization/races/${id}/${type}`;
      const restore = `/api/rulesets/${forkId}/entities/races/${sourceId}/restore`;
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      try {
        for (let repetition = 0; repetition < 3; repetition++) {
          const copied = await page.request.post(customization(sourceId, "properties"), { data: { type: "QA_INITIAL", value: "1" } });
          expect(copied.status(), await copied.text()).toBe(201);
          const copyId = z.object({ resolvedEntityId: z.string().uuid() }).parse(await copied.json()).resolvedEntityId;
          expect((await page.request.get(customization(copyId, "properties"))).ok()).toBe(true);
          const body = kind === "properties" ? { type: "QA_RACING", value: "1" }
            : kind === "requirements" ? { level: "1", chainingOperator: "and" }
            : { target: "abilities.strength.misc", value: "1", operator: "add" };
          const [added, removed] = await Promise.all([
            page.request.post(customization(copyId, kind), { data: body }),
            operation === "delete" ? page.request.delete(`/api/rulesets/${forkId}/races/${copyId}`) : page.request.post(restore),
          ]);
          expect(removed.ok(), await removed.text()).toBe(true);
          expect([201, 404], await added.text()).toContain(added.status());
          // The API hides orphan rows, so inspect persisted state after the
          // two independent HTTP transactions have both completed.
          const ownerColumn = kind === "modifiers" ? "source_id" : "entity_id";
          const remaining = await pool.query<{ count: string }>(`select count(*) from customization.${kind} where ${ownerColumn} = $1`, [copyId]);
          expect(Number(remaining.rows[0].count)).toBe(0);
          if (operation === "delete") expect((await page.request.post(restore)).ok()).toBe(true);
        }
      } finally {
        await pool.end();
      }
    });
  }
}
