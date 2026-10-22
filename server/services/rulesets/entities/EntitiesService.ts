import { z } from "zod";

import { NotFoundError } from "@/server/errors/index.ts";
import { RULESET_ENTITY_TYPES, type RulesetEntityType } from "@/server/repositories/index.ts";
import { AbilitiesService } from "@/server/services/rulesets/abilities/index.ts";
import { AptitudesService } from "@/server/services/rulesets/aptitudes/index.ts";
import { ClassesService } from "@/server/services/rulesets/classes/index.ts";
import type { EntityBody } from "@/server/services/rulesets/EntityWriter.ts";
import { FeatsService } from "@/server/services/rulesets/feats/index.ts";
import { ItemsService } from "@/server/services/rulesets/items/index.ts";
import { LanguagesService } from "@/server/services/rulesets/languages/index.ts";
import { MechanicsService } from "@/server/services/rulesets/mechanics/index.ts";
import { PowersService } from "@/server/services/rulesets/powers/index.ts";
import { RacesService } from "@/server/services/rulesets/races/index.ts";
import { SavesService } from "@/server/services/rulesets/saves/index.ts";
import { SkillsService } from "@/server/services/rulesets/skills/index.ts";
import type { Session } from "@/shared/relations.ts";
import { getUrlSegment } from "@/shared/urlSegments.ts";

import {
  buildKindServices,
  type KindServices,
  type ListShared,
  type Pagination,
  type VariantBody,
} from "./kindServices.ts";

/** What a refusal calls a kind's action it has none of: "No groups for races". */
const ACTION_WORDS: Readonly<Record<keyof KindServices, string>> = {
  create: "create",
  duplicate: "duplicate",
  get: "page",
  grouped: "groups",
  list: "list",
  remove: "delete",
  templates: "templates",
  update: "update",
  variants: "variants",
};

/** The kinds a race or a class is for: a list's partition. */
const KIND_FILTER = { kind: z.string().optional() };

/** A pool's entities: a list's pool. */
const POOL_FILTER = { aptitudeId: z.string().uuid().optional() };

/** Each entity kind's services, by its type: today's, one per kind, which the routes by kind dispatch to. */
const KINDS: Record<RulesetEntityType, KindServices> = {
  abilities: buildKindServices("abilities", {
    filters: {},
    get: (rulesetId, id) => AbilitiesService.getAbility(rulesetId, id),
    list: AbilitiesService.getAbilities.bind(AbilitiesService),
  }),
  aptitudes: buildKindServices("aptitudes", {
    create: (session, rulesetId, body) => AptitudesService.createAptitude(session, rulesetId, body),
    filters: { scope: z.enum(["feats", "spells"]).optional() },
    get: (rulesetId, id) => AptitudesService.getAptitude(rulesetId, id),
    list: AptitudesService.getAptitudes.bind(AptitudesService),
    remove: (session, rulesetId, id) => AptitudesService.deleteAptitude(session, rulesetId, id),
    update: (session, rulesetId, id, body) => AptitudesService.updateAptitude(session, rulesetId, id, body),
  }),
  feats: buildKindServices("feats", {
    create: (session, rulesetId, body) => FeatsService.createFeat(session, rulesetId, body),
    filters: { ...POOL_FILTER, family: z.string().optional() },
    get: (rulesetId, id) => FeatsService.getFeat(rulesetId, id),
    // Its families, a pool's, in their own order
    grouped: {
      filters: POOL_FILTER,
      list: FeatsService.getFeatGroups.bind(FeatsService),
    },
    list: FeatsService.getFeats.bind(FeatsService),
    remove: (session, rulesetId, id) => FeatsService.deleteFeat(session, rulesetId, id),
    update: (session, rulesetId, id, body) => FeatsService.updateFeat(session, rulesetId, id, body),
  }),
  items: buildKindServices("items", {
    create: (session, rulesetId, body) => ItemsService.createItem(session, rulesetId, body),
    duplicate: (session, rulesetId, id, body) => ItemsService.duplicateItem(session, rulesetId, id, body),
    filters: {
      isTemplate: z
        .enum(["true", "false"])
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
    },
    get: (rulesetId, id) => ItemsService.getItem(rulesetId, id),
    list: ItemsService.getItems.bind(ItemsService),
    remove: (session, rulesetId, id) => ItemsService.deleteItem(session, rulesetId, id),
    templates: (rulesetId, type) => ItemsService.getTemplates(rulesetId, type),
    update: (session, rulesetId, id, body) => ItemsService.updateItem(session, rulesetId, id, body),
    variants: (session, rulesetId, id, variants) => ItemsService.createVariants(session, rulesetId, id, variants),
  }),
  klasses: buildKindServices("klasses", {
    create: (session, rulesetId, body) => ClassesService.createClass(session, rulesetId, body),
    filters: KIND_FILTER,
    get: (rulesetId, id) => ClassesService.getClass(rulesetId, id),
    list: ClassesService.getClasses.bind(ClassesService),
    remove: (session, rulesetId, id) => ClassesService.deleteClass(session, rulesetId, id),
    update: (session, rulesetId, id, body) => ClassesService.updateClass(session, rulesetId, id, body),
  }),
  languages: buildKindServices("languages", {
    create: (session, rulesetId, body) => LanguagesService.createLanguage(session, rulesetId, body),
    filters: {},
    get: (rulesetId, id) => LanguagesService.getLanguage(rulesetId, id),
    list: LanguagesService.getLanguages.bind(LanguagesService),
    remove: (session, rulesetId, id) => LanguagesService.deleteLanguage(session, rulesetId, id),
    update: (session, rulesetId, id, body) => LanguagesService.updateLanguage(session, rulesetId, id, body),
  }),
  mechanics: buildKindServices("mechanics", {
    create: (session, rulesetId, body) => MechanicsService.createMechanic(session, rulesetId, body),
    filters: {},
    get: (rulesetId, id) => MechanicsService.getMechanic(rulesetId, id),
    list: MechanicsService.getMechanics.bind(MechanicsService),
    remove: (session, rulesetId, id) => MechanicsService.deleteMechanic(session, rulesetId, id),
    update: (session, rulesetId, id, body) => MechanicsService.updateMechanic(session, rulesetId, id, body),
  }),
  powers: buildKindServices("powers", {
    create: (session, rulesetId, body) => PowersService.createPower(session, rulesetId, body),
    filters: { ...POOL_FILTER, level: z.coerce.number().optional() },
    get: (rulesetId, id) => PowersService.getPower(rulesetId, id),
    list: PowersService.getPowers.bind(PowersService),
    remove: (session, rulesetId, id) => PowersService.deletePower(session, rulesetId, id),
    update: (session, rulesetId, id, body) => PowersService.updatePower(session, rulesetId, id, body),
  }),
  races: buildKindServices("races", {
    create: (session, rulesetId, body) => RacesService.createRace(session, rulesetId, body),
    filters: KIND_FILTER,
    get: (rulesetId, id) => RacesService.getRace(rulesetId, id),
    list: RacesService.getRaces.bind(RacesService),
    remove: (session, rulesetId, id) => RacesService.deleteRace(session, rulesetId, id),
    update: (session, rulesetId, id, body) => RacesService.updateRace(session, rulesetId, id, body),
  }),
  saves: buildKindServices("saves", {
    create: (session, rulesetId, body) => SavesService.createSave(session, rulesetId, body),
    filters: {},
    get: (rulesetId, id) => SavesService.getSave(rulesetId, id),
    list: SavesService.getSaves.bind(SavesService),
    remove: (session, rulesetId, id) => SavesService.deleteSave(session, rulesetId, id),
    update: (session, rulesetId, id, body) => SavesService.updateSave(session, rulesetId, id, body),
  }),
  skills: buildKindServices("skills", {
    create: (session, rulesetId, body) => SkillsService.createSkill(session, rulesetId, body),
    filters: {},
    get: (rulesetId, id) => SkillsService.getSkill(rulesetId, id),
    list: SkillsService.getSkills.bind(SkillsService),
    remove: (session, rulesetId, id) => SkillsService.deleteSkill(session, rulesetId, id),
    update: (session, rulesetId, id, body) => SkillsService.updateSkill(session, rulesetId, id, body),
  }),
};

/** Every entity kind's type, which the routes by kind take. */
export const ENTITY_TYPES: readonly RulesetEntityType[] = RULESET_ENTITY_TYPES;

/**
 * A ruleset's entities by their kind (`type`, its table), whatever it is: each answered by its kind's service, its
 * list's filters read by its kind's schemas (`buildKindServices`). An action a kind has none of (an ability's create, a
 * race's templates) is refused as not found.
 */
class EntitiesService {
  /** A kind's action (`action`): refused as not found when it has none. */
  private actionOf<A extends keyof KindServices>(type: RulesetEntityType, action: A): NonNullable<KindServices[A]> {
    const found = this.kindOf(type)[action];
    if (!found) throw new NotFoundError(`No ${ACTION_WORDS[action]} for ${getUrlSegment(type)}`);
    return found;
  }

  /** A kind's services. */
  private kindOf(type: RulesetEntityType) {
    return KINDS[type];
  }

  async createEntity(session: Session, rulesetId: string, type: RulesetEntityType, body: EntityBody) {
    return await this.actionOf(type, "create")(session, rulesetId, body);
  }

  async createVariants(
    session: Session,
    rulesetId: string,
    type: RulesetEntityType,
    sourceId: string,
    variants: VariantBody[],
  ) {
    return await this.actionOf(type, "variants")(session, rulesetId, sourceId, variants);
  }

  async deleteEntity(session: Session, rulesetId: string, type: RulesetEntityType, entityId: string) {
    return await this.actionOf(type, "remove")(session, rulesetId, entityId);
  }

  async duplicateEntity(
    session: Session,
    rulesetId: string,
    type: RulesetEntityType,
    sourceId: string,
    body: EntityBody,
  ) {
    return await this.actionOf(type, "duplicate")(session, rulesetId, sourceId, body);
  }

  async getEntities(
    rulesetId: string,
    type: RulesetEntityType,
    { filters, ...where }: ListShared & { filters: Record<string, unknown> },
    pagination: Pagination,
  ) {
    return await this.kindOf(type).list(rulesetId, where, filters, pagination);
  }

  async getEntity(rulesetId: string, type: RulesetEntityType, entityId: string) {
    return await this.kindOf(type).get(rulesetId, entityId);
  }

  async getEntityGroups(
    rulesetId: string,
    type: RulesetEntityType,
    { filters, ...where }: ListShared & { filters: Record<string, unknown> },
    pagination: Pagination,
  ) {
    return await this.actionOf(type, "grouped")(rulesetId, where, filters, pagination);
  }

  async getTemplates(rulesetId: string, type: RulesetEntityType, templateType: string | undefined) {
    return await this.actionOf(type, "templates")(rulesetId, templateType);
  }

  async updateEntity(session: Session, rulesetId: string, type: RulesetEntityType, entityId: string, body: EntityBody) {
    return await this.actionOf(type, "update")(session, rulesetId, entityId, body);
  }
}

export default new EntitiesService();
