import type { EntityCustomizations } from "@/engine/index.ts";
import type { Db } from "@/server/database/index.ts";
import { Modifiers, Properties, Requirements } from "@/server/repositories/index.ts";
import { isCustomizableEntityType } from "@/shared/customization/entities.ts";

/**
 * An entity's customizations (its modifiers, each with its requirements, its properties and its requirements), read and
 * copied onto other entities: a copy's (`EntityCopy`), and a duplicate's (an item's, its variants', a modifier's).
 */
export default class CustomizationCopies {
  /** Each entity's customizations, by its id: the rows grouped by the entity they belong to, a modifier's by its source. */
  private static group(
    entityIds: string[],
    modifiers: EntityCustomizations["modifiers"],
    properties: EntityCustomizations["properties"],
    requirements: EntityCustomizations["requirements"],
    modifierRequirements: EntityCustomizations["modifierRequirements"],
  ): Map<string, EntityCustomizations> {
    const modifierToEntity = new Map<string, string>();
    for (const m of modifiers) modifierToEntity.set(m.id, m.sourceId);

    const map = new Map<string, EntityCustomizations>();
    for (const id of entityIds)
      map.set(id, { modifiers: [], properties: [], requirements: [], modifierRequirements: [] });

    for (const m of modifiers) map.get(m.sourceId)?.modifiers.push(m);
    for (const p of properties) map.get(p.entityId)?.properties.push(p);
    for (const r of requirements) map.get(r.entityId)?.requirements.push(r);
    for (const mr of modifierRequirements) {
      const entityId = modifierToEntity.get(mr.entityId);
      if (entityId) map.get(entityId)?.modifierRequirements.push(mr);
    }
    return map;
  }

  /**
   * Inserts one copy of each row per target in a single batch, target-major, with `owner` repointing each copy. Copies
   * pair with their sources by position, and the first target's copies are recorded in `copiedIds`: equal values do
   * not imply the same row (a modifier's requirements may differ).
   */
  private static async copyRows<R extends { id: string }>(
    tx: Db,
    repo: { createMany(db: Db, values: (Omit<R, "id"> & { id: undefined })[]): Promise<{ id: string }[]> },
    rows: R[],
    targetEntityIds: string[],
    owner: (row: R, targetId: string, targetIndex: number) => Partial<R>,
    copiedIds?: Map<string, string>,
  ): Promise<{ id: string }[]> {
    if (rows.length === 0) return [];
    const copies = await repo.createMany(
      tx,
      targetEntityIds.flatMap((targetId, targetIndex) =>
        rows.map((row) => ({ ...row, ...owner(row, targetId, targetIndex), id: undefined })),
      ),
    );
    for (let i = 0; i < rows.length; i++) copiedIds?.set(rows[i].id, copies[i].id);

    return copies;
  }

  /** Copies customizations onto one entity, each copy's id recorded by its source's (`copiedIds`). */
  static async copy(
    tx: Db,
    targetEntityId: string,
    entityType: string,
    sourceCust: EntityCustomizations,
    copiedIds?: Map<string, string>,
  ): Promise<void> {
    await CustomizationCopies.copyToMany(tx, [targetEntityId], entityType, sourceCust, copiedIds);
  }

  /** Copies customizations onto each of several entities, in one batch per kind. */
  static async copyToMany(
    tx: Db,
    targetEntityIds: string[],
    entityType: string,
    sourceCust: EntityCustomizations,
    copiedIds?: Map<string, string>,
  ): Promise<void> {
    if (targetEntityIds.length === 0) return;
    // Copies are paired with their sources by position, so reject inputs that
    // position cannot represent instead of writing rows to the wrong owner.
    if (copiedIds && targetEntityIds.length > 1)
      throw new Error("copiedIds maps each source row to one copy; copy to a single target");

    if (!isCustomizableEntityType(entityType) && sourceCust.modifiers.length > 0)
      throw new Error(`Cannot copy modifiers onto ${entityType}`);

    const sourceModifierIds = new Set(sourceCust.modifiers.map((m) => m.id));
    const orphan = sourceCust.modifierRequirements.find((r) => !sourceModifierIds.has(r.entityId));
    if (orphan) throw new Error(`Modifier requirement ${orphan.id} belongs to a modifier outside the copied set`);

    const { modifiers, properties, requirements, modifierRequirements } = sourceCust;
    const newModifiers = await CustomizationCopies.copyRows(
      tx,
      Modifiers,
      modifiers,
      targetEntityIds,
      (_, targetId) => ({ sourceId: targetId }),
      copiedIds,
    );
    await CustomizationCopies.copyRows(
      tx,
      Properties,
      properties,
      targetEntityIds,
      (_, targetId) => ({ entityId: targetId }),
      copiedIds,
    );
    await CustomizationCopies.copyRows(
      tx,
      Requirements,
      requirements,
      targetEntityIds,
      (_, targetId) => ({ entityId: targetId }),
      copiedIds,
    );
    // A modifier requirement belongs to the copy of its modifier made for the same target.
    const modifierIndex = new Map(modifiers.map((m, i) => [m.id, i]));
    await CustomizationCopies.copyRows(
      tx,
      Requirements,
      modifierRequirements,
      targetEntityIds,
      (r, _, targetIndex) => ({
        entityId: newModifiers[targetIndex * modifiers.length + modifierIndex.get(r.entityId)!].id,
      }),
      copiedIds,
    );
  }

  /**
   * The customizations of `entityIds` (of `entityType`), by entity, read by their stored ids: their properties and
   * requirements, and, for a type modifiers have (`sourceType`), their modifiers with each one's requirements.
   */
  static async read(
    tx: Db,
    entityIds: string[],
    entityType: string,
    sourceType?: string,
  ): Promise<Map<string, EntityCustomizations>> {
    const modifiers = sourceType ? await Modifiers.findMany(tx, { sourceIds: entityIds, sourceType }) : [];
    const properties = await Properties.findMany(tx, { entityIds, entityType });
    const requirements = await Requirements.findMany(tx, { entityIds, entityType });

    const modifierRequirements = await Requirements.findMany(tx, {
      entityIds: modifiers.map((m) => m.id),
      entityType: "modifiers",
    });

    return CustomizationCopies.group(entityIds, modifiers, properties, requirements, modifierRequirements);
  }
}
