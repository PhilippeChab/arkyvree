import { describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";

import { db } from "@/server/database/index.ts";
import { EntityReferences, Picks } from "@/server/repositories/index.ts";

describe("A repoint of what names an entity, an unsubscribe's or a revert's", () => {
  test("numbers a level's repeated picks of the entity after those of the one it points them at", async () => {
    const [pick] = (
      await db.execute<{ advancement_id: string; via_id: string }>(sql`
        SELECT advancement_id, via_id FROM character.advancement_picks
        WHERE step = 'feats' AND via_id IS NOT NULL LIMIT 1`)
    ).rows;
    const [from, to] = (
      await db.execute<{ id: string }>(sql`SELECT id FROM rules.entities WHERE type = 'feats' ORDER BY id LIMIT 2`)
    ).rows.map((feat) => feat.id);
    // The level picked `from` twice (a stackable feat), and `to` once
    await Picks.createMany(db, "feats", [
      { characterLevelId: pick.advancement_id, featId: from, aptitudeId: pick.via_id },
      { characterLevelId: pick.advancement_id, featId: from, aptitudeId: pick.via_id },
      { characterLevelId: pick.advancement_id, featId: to, aptitudeId: pick.via_id },
    ]);

    await db.transaction(async (tx) => {
      await EntityReferences.update(tx, { entityId: to }, { entityId: from, entityType: "feats" });
    });

    const picked = await db.execute<{ entity_id: string; ordinal: number }>(sql`
      SELECT entity_id, ordinal FROM character.advancement_picks
      WHERE advancement_id = ${pick.advancement_id} AND entity_id IN (${from}, ${to}) ORDER BY ordinal`);
    expect(picked.rows).toEqual([
      { entity_id: to, ordinal: 0 },
      { entity_id: to, ordinal: 1 },
      { entity_id: to, ordinal: 2 },
    ]);
  });
});
