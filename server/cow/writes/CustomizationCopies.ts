import type { Db } from "@/drizzle/database.ts";
import { Engine, type EntityCustomizations } from "@/engine/index.ts";
import { Modifiers, NameBindings, Requirements } from "@/server/repositories/index.ts";
import { CUSTOMIZATION_TYPES } from "@/shared/customization/customizationTypes.ts";
import type { BaseRules } from "@/shared/enums.ts";

/**
 * An entity's customizations (its modifiers, each with its requirements, and its requirements), read and copied onto
 * other entities: a copy's (`EntityCopy`), and a duplicate's (an item's, its variants', a modifier's), in a base
 * rules' rulesets (`baseRules`), whose module says which kinds have modifiers.
 */
export default class CustomizationCopies {
  constructor(private readonly baseRules: BaseRules) {}

  /** Each entity's customizations, by its id: the rows grouped by the entity they belong to, a modifier's by its source. */
  private static group(
    entityIds: string[],
    modifiers: EntityCustomizations["modifiers"],
    requirements: EntityCustomizations["requirements"],
    modifierRequirements: EntityCustomizations["modifierRequirements"],
  ): Map<string, EntityCustomizations> {
    const modifierToEntity = new Map<string, string>();
    for (const m of modifiers) modifierToEntity.set(m.id, m.sourceId);

    const map = new Map<string, EntityCustomizations>();
    for (const id of entityIds) map.set(id, { modifiers: [], requirements: [], modifierRequirements: [] });

    for (const m of modifiers) map.get(m.sourceId)?.modifiers.push(m);
    for (const r of requirements) map.get(r.entityId)?.requirements.push(r);
    for (const mr of modifierRequirements) {
      const entityId = modifierToEntity.get(mr.entityId);
      if (entityId) map.get(entityId)?.modifierRequirements.push(mr);
    }
    return map;
  }

  /**
   * Gives each copy (`copies`, target-major, paired with `rows` by position) what its source's names mean: a copy
   * means what its source meant, whatever its ruleset calls it.
   */
  private static async copyBindings(
    tx: Db,
    rows: { id: string }[],
    copies: { id: string }[],
    of: "modifierId" | "requirementId",
  ) {
    const ids = rows.map((row) => row.id);
    const bindings = await NameBindings.findMany(
      tx,
      of === "modifierId" ? { modifierIds: ids, requirementIds: [] } : { modifierIds: [], requirementIds: ids },
    );
    if (bindings.length === 0) return;
    const indexOf = new Map(ids.map((id, index) => [id, index]));
    const copied = copies.flatMap((copy, position) =>
      bindings
        .filter((binding) => indexOf.get(binding[of]!) === position % rows.length)
        .map(({ entityId, entityType, field, kind, name, path, segment }) => ({
          entityId,
          entityType,
          field: field === "value" ? ("value" as const) : ("target" as const),
          kind: kind === "group" ? ("group" as const) : ("entity" as const),
          name,
          path,
          segment,
          ...(of === "modifierId" ? { modifierId: copy.id } : { requirementId: copy.id }),
        })),
    );
    await NameBindings.createMany(tx, copied);
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
    copiedIds: Map<string, string> | undefined,
    of: "modifierId" | "requirementId",
  ): Promise<{ id: string }[]> {
    if (rows.length === 0) return [];
    const copies = await repo.createMany(
      tx,
      targetEntityIds.flatMap((targetId, targetIndex) =>
        rows.map((row) => ({ ...row, ...owner(row, targetId, targetIndex), id: undefined })),
      ),
    );
    for (let i = 0; i < rows.length; i++) copiedIds?.set(rows[i].id, copies[i].id);
    await CustomizationCopies.copyBindings(tx, rows, copies, of);

    return copies;
  }

  /**
   * Whether entities of a type have modifiers: a kind its module declares customizable does (`customizableKinds`), any
   * other doesn't.
   */
  private hasModifiers(entityType: string): boolean {
    return Engine.forRules(this.baseRules).storage().customizableKinds().includes(entityType);
  }

  /** Copies customizations onto one entity, each copy's id recorded by its source's (`copiedIds`). */
  async copy(
    tx: Db,
    targetEntityId: string,
    entityType: string,
    sourceCust: EntityCustomizations,
    copiedIds?: Map<string, string>,
  ): Promise<void> {
    await this.copyToMany(tx, [targetEntityId], entityType, sourceCust, copiedIds);
  }

  /** Copies customizations onto each of several entities, in one batch per kind. */
  async copyToMany(
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

    if (!this.hasModifiers(entityType) && sourceCust.modifiers.length > 0)
      throw new Error(`Cannot copy modifiers onto ${entityType}`);

    const sourceModifierIds = new Set(sourceCust.modifiers.map((m) => m.id));
    const orphan = sourceCust.modifierRequirements.find((r) => !sourceModifierIds.has(r.entityId));
    if (orphan) throw new Error(`Modifier requirement ${orphan.id} belongs to a modifier outside the copied set`);

    const { modifiers, requirements, modifierRequirements } = sourceCust;
    const newModifiers = await CustomizationCopies.copyRows(
      tx,
      Modifiers,
      modifiers,
      targetEntityIds,
      (_, targetId) => ({ sourceId: targetId }),
      copiedIds,
      "modifierId",
    );
    await CustomizationCopies.copyRows(
      tx,
      Requirements,
      requirements,
      targetEntityIds,
      (_, targetId) => ({ entityId: targetId }),
      copiedIds,
      "requirementId",
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
      "requirementId",
    );
  }

  /**
   * The customizations of `entityIds` (of `entityType`), by entity, read by their stored ids: their requirements, and,
   * for a type modifiers have (`hasModifiers`), their modifiers with each one's requirements.
   */
  async read(tx: Db, entityIds: string[], entityType: string): Promise<Map<string, EntityCustomizations>> {
    const modifiers = this.hasModifiers(entityType)
      ? await Modifiers.findMany(tx, { sourceIds: entityIds, sourceType: entityType })
      : [];
    const requirements = await Requirements.findMany(tx, { entityIds, entityType });

    const modifierRequirements = await Requirements.findMany(tx, {
      entityIds: modifiers.map((m) => m.id),
      entityType: CUSTOMIZATION_TYPES.modifier,
    });

    return CustomizationCopies.group(entityIds, modifiers, requirements, modifierRequirements);
  }
}
