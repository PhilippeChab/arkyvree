import {
  CowDataBuilder,
  mergeSiblingAptitudeLinks,
  mergeSiblingModifiers,
  mergeSiblingProperties,
  mergeSiblingRequirements,
  type RulesetSources,
} from "@/server/cache/rulesetCache/index.ts";
import { type CowData, type Db, withCowContext } from "@/server/database/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import {
  EntitySnapshots,
  FeatsAptitudes,
  KlassLevelFeats,
  KlassLevelPowers,
  KlassLevels,
  KlassLevelSaves,
  KlassSkills,
  PowersAptitudes,
  type RulesetEntityType,
} from "@/server/repositories/index.ts";
import { isCustomizableEntityType } from "@/shared/customization/entities.ts";

import { copyEntityCustomizations } from "./copyCustomizations.ts";
import { type EntityCustomizations, fetchEntityCustomizations, fetchSiblingCustomizations } from "./customizations.ts";
import { ENTITY_REPOS, type EntityWithId } from "./entityRepositories.ts";

/**
 * A copy made: the copied entity, and each customization it copied, by its source's id (equal values don't make the
 * same row: a modifier's requirements may differ).
 */
export interface CopiedEntity {
  copiedIds: ReadonlyMap<string, string>;
  entity: EntityWithId;
}

/**
 * COW trigger: one copy of an inherited entity into a fork (`EntityCopy.create`), with all its customizations and
 * relationships, its sibling copies' data merged in, and the entity_snapshot record. Each copy is its own instance,
 * which records the customizations it copied.
 */
export default class EntityCopy {
  private constructor(entityType: RulesetEntityType, entityId: string, ruleset: RulesetSources) {
    this.entityType = entityType;
    this.entityId = entityId;
    this.ruleset = ruleset;
    this.sourceType = isCustomizableEntityType(entityType) ? entityType : undefined;
  }

  /**
   * Copies `entityId` into `ruleset`, or returns the copy it already has (then with no copied ids): the newly created
   * child entity, and the customizations copied with it.
   */
  static async create(
    tx: Db,
    entityType: RulesetEntityType,
    entityId: string,
    ruleset: RulesetSources,
  ): Promise<CopiedEntity> {
    const copy = new EntityCopy(entityType, entityId, ruleset);
    const entity = await copy.copy(tx);
    return { entity, copiedIds: copy.copiedIds };
  }

  private readonly copiedIds = new Map<string, string>();

  private readonly entityId: string;

  private readonly entityType: RulesetEntityType;

  /** The ruleset the copy is made in, and where its inherited entities come from. */
  private readonly ruleset: RulesetSources;

  private readonly sourceType: string | undefined;

  /** Copies the entity into the target ruleset, or returns the copy it already has: the newly created child entity. */
  private async copy(tx: Db): Promise<EntityWithId> {
    const repo = ENTITY_REPOS[this.entityType];
    const { id: childRulesetId } = this.ruleset;

    // A second first edit must wait for the copying transaction, then see its
    // committed snapshot. Keep this separate from the SELECT: under READ
    // COMMITTED, a SELECT started before the wait retains its old snapshot.
    await EntitySnapshots.lock(tx, { rulesetId: childRulesetId, sourceEntityId: this.entityId });

    // 0. Idempotency: if a COW copy already exists, return it.
    // If the snapshot is a tombstone (the COW row was hard-deleted by a
    // user-initiated delete on an overridden entity), drop the snapshot so
    // we can re-COW below with a fresh forkedEntityId.
    const existingSnapshot = await EntitySnapshots.findOne(tx, {
      sourceEntityId: this.entityId,
      rulesetId: childRulesetId,
    });
    if (existingSnapshot) {
      const exists = await repo.lock(tx, { id: existingSnapshot.forkedEntityId });
      const existing = exists ? await repo.findOne(tx, { id: existingSnapshot.forkedEntityId }) : undefined;
      if (existing) return existing;
      await EntitySnapshots.delete(tx, {
        sourceEntityId: this.entityId,
        rulesetId: childRulesetId,
      });
    }

    // 1. Fetch the parent entity
    if (!(await repo.lock(tx, { id: this.entityId }, "share")))
      throw new NotFoundError("Customization source no longer exists; refresh the entity");

    const parentEntity = await repo.findOne(tx, { id: this.entityId });
    if (!parentEntity) throw new Error(`Parent entity not found: ${this.entityType}/${this.entityId}`);

    // 2. Copy entity to child ruleset
    const { id: _id, createdAt: _ca, updatedAt: _ua, deletedAt: _da, rulesetId: _rid, ...entityData } = parentEntity;
    const newRows = await repo.create(tx, { ...entityData, rulesetId: childRulesetId });
    const newEntity = newRows[0];

    // 3. Copy customizations
    const customizations = await fetchEntityCustomizations(tx, [this.entityId], this.entityType, this.sourceType);
    const cust = customizations.get(this.entityId) ?? {
      modifiers: [],
      properties: [],
      requirements: [],
      modifierRequirements: [],
    };
    await copyEntityCustomizations(tx, newEntity.id, this.entityType, cust, this.copiedIds);

    // 4. Copy relationships (aptitudes, klass levels, etc.), remapped by the ruleset's copy-on-write data as the
    // transaction sees it: its own copies included
    const cow = await CowDataBuilder.build(tx, this.ruleset);
    await this.copyRelationships(tx, newEntity.id, cow);

    // 4b. Merge sibling data when multiple extensions COW the same base entity
    const siblingIds = cow.getSiblings(this.entityId);
    if (siblingIds.length > 0) await this.mergeSiblings(tx, newEntity.id, cust, siblingIds, cow);

    // 5. Record the copy: the ruleset's view shows it in place of the parent
    await EntitySnapshots.create(tx, {
      rulesetId: childRulesetId,
      entityType: this.entityType,
      sourceEntityId: this.entityId,
      forkedEntityId: newEntity.id,
    });

    return newEntity;
  }

  /** Copies a class's levels onto the target class, with their saves, granted feats and powers, and customizations. */
  private async copyKlassLevels(tx: Db, targetKlassId: string, cow: CowData) {
    const levels = await KlassLevels.findMany(tx, { klassId: this.entityId });
    if (levels.length === 0) return;

    const newLevels = await KlassLevels.createMany(
      tx,
      levels.map((l) => ({ ...l, id: undefined, klassId: targetKlassId })),
    );

    // Build level ID map (old -> new)
    const levelIdMapLocal: Record<string, string> = {};
    for (let i = 0; i < levels.length; i++) levelIdMapLocal[levels[i].id] = newLevels[i].id;

    const oldLevelIds = levels.map((l) => l.id);
    const levelSaves = await KlassLevelSaves.findMany(tx, { klassLevelIds: oldLevelIds });
    const levelFeats = await KlassLevelFeats.findMany(tx, { klassLevelIds: oldLevelIds });
    const levelPowers = await KlassLevelPowers.findMany(tx, { klassLevelIds: oldLevelIds });

    // Copy level customizations (modifiers, properties, requirements)
    const levelCusts = await fetchEntityCustomizations(tx, oldLevelIds, "klass_levels", "klass_levels");
    for (const oldLevelId of oldLevelIds) {
      const newLevelId = levelIdMapLocal[oldLevelId];
      const cust = levelCusts.get(oldLevelId);
      if (cust && newLevelId) await copyEntityCustomizations(tx, newLevelId, "klass_levels", cust, this.copiedIds);
    }

    await KlassLevelSaves.createMany(
      tx,
      levelSaves.map((ls) => ({
        klassLevelId: levelIdMapLocal[ls.klassLevelId],
        saveId: cow.resolve(ls.saveId),
        base: ls.base,
      })),
    );
    await KlassLevelFeats.createMany(
      tx,
      levelFeats.map((lf) => ({
        klassLevelId: levelIdMapLocal[lf.klassLevelId],
        featId: cow.resolve(lf.featId),
        aptitudeId: cow.resolve(lf.aptitudeId),
        free: lf.free,
      })),
    );
    await KlassLevelPowers.createMany(
      tx,
      levelPowers.map((lp) => ({
        klassLevelId: levelIdMapLocal[lp.klassLevelId],
        powerId: cow.resolve(lp.powerId),
        aptitudeId: cow.resolve(lp.aptitudeId),
        free: lp.free,
      })),
    );
  }

  /**
   * Copy relationship data (join tables) onto the copy: a feat's or a power's aptitudes, a class's skills and levels.
   * Resolved through the copy's CowData (true overrides + sibling-loser aliases) — a child copy's references should
   * always point at the canonical winner, never at a stale loser.
   */
  private async copyRelationships(tx: Db, targetEntityId: string, cow: CowData) {
    if (this.entityType === "feats") {
      const featsAptitudes = await FeatsAptitudes.findMany(tx, { featId: this.entityId });
      if (featsAptitudes.length > 0) {
        await FeatsAptitudes.createMany(
          tx,
          featsAptitudes.map((fa) => ({
            featId: targetEntityId,
            aptitudeId: cow.resolve(fa.aptitudeId),
          })),
        );
      }
    } else if (this.entityType === "powers") {
      const powersAptitudes = await PowersAptitudes.findMany(tx, { powerId: this.entityId });
      if (powersAptitudes.length > 0) {
        await PowersAptitudes.createMany(
          tx,
          powersAptitudes.map((pa) => ({
            powerId: targetEntityId,
            aptitudeId: cow.resolve(pa.aptitudeId),
            level: pa.level,
          })),
        );
      }
    } else if (this.entityType === "klasses") {
      const klassSkills = await KlassSkills.findMany(tx, { klassIds: [this.entityId] });
      if (klassSkills.length > 0) {
        await KlassSkills.createMany(
          tx,
          klassSkills.map((ks) => ({
            klassId: targetEntityId,
            skillId: cow.resolve(ks.skillId),
          })),
        );
      }

      await this.copyKlassLevels(tx, targetEntityId, cow);
    }
  }

  /**
   * Merges sibling aptitude links of a feat or a power (`mergeSiblingAptitudeLinks`), each to the aptitude that stands
   * for it, as the copy's own (`copyRelationships`). Sibling reads turn copy-on-write resolution off (loser ids would
   * otherwise be canonicalized to the winner). Existing reads on targetEntityId go through the repo since the new id
   * isn't a stale id.
   */
  private async mergeAptitudeLinks(tx: Db, targetEntityId: string, siblingIds: string[], cow: CowData) {
    const resolve = (id: string) => cow.resolve(id);
    if (this.entityType === "feats") {
      const own = await FeatsAptitudes.findMany(tx, { featId: targetEntityId });
      const siblingLinks = Map.groupBy(
        await withCowContext(undefined, () => FeatsAptitudes.findMany(tx, { featIds: siblingIds })),
        (link) => link.featId,
      );
      const siblings = siblingIds.map((id) => siblingLinks.get(id) ?? []);
      const links = mergeSiblingAptitudeLinks(own, siblings, resolve);
      if (links.length > 0) {
        await FeatsAptitudes.createMany(
          tx,
          links.map((link) => ({ featId: targetEntityId, aptitudeId: resolve(link.aptitudeId) })),
        );
      }
    } else if (this.entityType === "powers") {
      const own = await PowersAptitudes.findMany(tx, { powerId: targetEntityId });
      const siblingLinks = Map.groupBy(
        await withCowContext(undefined, () => PowersAptitudes.findMany(tx, { powerIds: siblingIds })),
        (link) => link.powerId,
      );
      const siblings = siblingIds.map((id) => siblingLinks.get(id) ?? []);
      const links = mergeSiblingAptitudeLinks(own, siblings, resolve);
      if (links.length > 0) {
        await PowersAptitudes.createMany(
          tx,
          links.map((link) => ({ powerId: targetEntityId, aptitudeId: resolve(link.aptitudeId), level: link.level })),
        );
      }
    }
  }

  /**
   * Merge sibling data into the copy. When multiple extensions COW the same base entity, the "winner" is copied first.
   * This merges what its siblings add, by the rules a ruleset's view merges them by (`siblingMerge.ts`), so the child
   * fork starts from the merged view: their modifiers (each with its requirements), properties and requirements against
   * the winner's (`own`, which the copy holds), then their aptitude links. Each copied row's id is recorded.
   */
  private async mergeSiblings(
    tx: Db,
    targetEntityId: string,
    own: EntityCustomizations,
    siblingIds: string[],
    cow: CowData,
  ) {
    // Sibling-loser ids resolve to their winners in a scope's CowData, so the
    // repo proxy would rewrite `Modifiers.findMany({ sourceIds: siblingIds })` to fetch the
    // winner's rows. This merge explicitly wants the literal stored
    // loser rows, so it reads them with copy-on-write resolution off (the proxy
    // wraps repos for application-code convenience; this is infrastructure
    // copying raw rows by id).
    const siblingCusts = await fetchSiblingCustomizations(tx, siblingIds, this.entityType, this.sourceType);
    const siblings = siblingIds.flatMap((id) => siblingCusts.get(id) ?? []);
    const modifiers = mergeSiblingModifiers(
      own.modifiers,
      siblings.map((cust) => cust.modifiers),
    );
    const modifierIds = new Set(modifiers.map((m) => m.id));
    await copyEntityCustomizations(
      tx,
      targetEntityId,
      this.entityType,
      {
        modifiers,
        modifierRequirements: siblings
          .flatMap((cust) => cust.modifierRequirements)
          .filter((r) => modifierIds.has(r.entityId)),
        properties: mergeSiblingProperties(
          own.properties,
          siblings.map((cust) => cust.properties),
        ),
        requirements: mergeSiblingRequirements(
          own.requirements,
          siblings.map((cust) => cust.requirements),
          targetEntityId,
        ),
      },
      this.copiedIds,
    );
    await this.mergeAptitudeLinks(tx, targetEntityId, siblingIds, cow);
  }
}
