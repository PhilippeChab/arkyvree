import type { Db } from "@/drizzle/database.ts";
import { Entities } from "@/server/repositories/index.ts";

/**
 * The owned entities of a kind (`ownedType`: a class's levels) of each owner (`owners`' keys), each with the one of its
 * position owned by the owner it pairs with (`owners`' values), as the views pair a copy's with its source's
 * (`CowDataBuilder`): none when that owner has none there, or when the owner pairs with none. A restore moves what names
 * a copy's to its source's (`EntityRevert`), and an unsubscribe what names a departing owner's to its fallback's.
 */
export async function findOwnedPairs(
  tx: Db,
  ownedType: string,
  owners: ReadonlyMap<string, string | undefined>,
): Promise<Map<string, string | undefined>> {
  const pairedIds = [...owners.values()].filter((id) => id !== undefined);
  const positions = await Entities.findPositions(tx, {
    entityType: ownedType,
    ownerIds: [...owners.keys(), ...pairedIds],
  });
  const ownedOf = Map.groupBy(positions, (owned) => owned.ownerId);
  const pairs = new Map<string, string | undefined>();
  for (const [ownerId, pairedId] of owners) {
    const theirs = new Map((pairedId ? (ownedOf.get(pairedId) ?? []) : []).map((owned) => [owned.position, owned.id]));
    for (const owned of ownedOf.get(ownerId) ?? []) pairs.set(owned.id, theirs.get(owned.position));
  }
  return pairs;
}
