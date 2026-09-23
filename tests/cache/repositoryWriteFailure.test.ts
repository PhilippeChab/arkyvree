import { expect, test } from 'bun:test';
import { getSeedContext } from '@/database/seeds/helpers.ts';
import { db } from '@/server/database/index.ts';
import { Requirements, Rulesets } from '@/server/repositories/index.ts';
import { runWithRequestCache } from '@/server/database/requestCache.ts';

test('a rejected repository write remains handled and subsequent reads work', async () => {
  const ctx = await getSeedContext(db);
  await runWithRequestCache(async () => {
    const cached = Rulesets.findOne(db, { id: ctx.rulesetId });
    await cached;
    // A nested transaction rolls the real constraint failure back to a savepoint.
    await expect(db.transaction(tx => Requirements.create(tx, {
      entityId: ctx.featMap.Toughness, entityType: 'feats', level: '1',
      target: 'abilities.strength.base', operator: 'invalid-operator', value: '13', valueType: 'number',
    }))).rejects.toThrow();
    await new Promise<void>(resolve => setImmediate(resolve));
    const fresh = Rulesets.findOne(db, { id: ctx.rulesetId });
    expect(fresh).not.toBe(cached);
    expect((await fresh)?.id).toBe(ctx.rulesetId);
  });
});
