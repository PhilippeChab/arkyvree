import { z } from "zod";

import { RulesError } from "@/engine/index.ts";
import { NotFoundError } from "@/server/errors/index.ts";
import { type Paginated, RULESET_ENTITY_TYPES, type RulesetEntityType } from "@/server/repositories/index.ts";
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

import { filterChoice, filterFlag, filterNumber, filterText } from "./filterValues.ts";

/** What one kind of entity answers, by its service: its list and its filters, its page, and what it lets a form do. */
interface KindServices {
  create?: (session: Session, rulesetId: string, body: EntityBody) => Promise<EntityRow>;
  duplicate?: (session: Session, rulesetId: string, sourceId: string, body: EntityBody) => Promise<EntityRow>;
  /** Its list's filters past the shared ones, by their query keys (a race's `kind`, a spell's `aptitudeId` and `level`) */
  filters: z.ZodRawShape;
  get: (rulesetId: string, entityId: string) => Promise<EntityRow>;
  /** Its list in groups (a feat's families), each its members */
  grouped?: (rulesetId: string, where: ListWhere, pagination: Pagination) => Promise<Paginated<unknown>>;
  list: (rulesetId: string, where: ListWhere, pagination: Pagination) => Promise<Paginated<EntityRow>>;
  remove?: (session: Session, rulesetId: string, entityId: string) => Promise<unknown>;
  /** The entities of a type others are made from (an item's templates of a type) */
  templates?: (rulesetId: string, type: string | undefined) => Promise<EntityRow[]>;
  update?: (session: Session, rulesetId: string, entityId: string, body: EntityBody) => Promise<EntityRow>;
  /** Copies of an entity, each its own name and description (an item's variants) */
  variants?: (session: Session, rulesetId: string, sourceId: string, variants: VariantBody[]) => Promise<unknown>;
}

/** What a list reads, every kind's: its search, its own entities alone, its order. */
interface ListShared {
  childOnly?: boolean;
  orderBy?: "createdAt" | "name" | "updatedAt";
  orderDir?: "asc" | "desc";
  search?: string;
}

/** What a list reads, every kind's, and its kind's filters, read. */
interface ListWhere extends ListShared {
  [filter: string]: unknown;
}

/** A page of a list. */
interface Pagination {
  limit: number;
  page: number;
}

/** A variant's own name and description. */
interface VariantBody {
  description?: string | null;
  name: string;
}

/** A ruleset entity, any kind's, as its page or its list reads it: its row, with the fields it holds. */
export interface EntityRow {
  [key: string]: unknown;
  description: string | null;
  id: string;
  name: string;
  rulesetId: string;
}

/** The kinds a race or a class is for: a list's partition. */
const KIND_FILTER = { kind: z.string().optional() };

/** A pool's entities: a list's pool. */
const POOL_FILTER = { aptitudeId: z.string().uuid().optional() };

/**
 * Each entity kind's services, by its type: today's, one per kind, which the routes by kind dispatch to. Its list's
 * filters are read here, a list refused one its kind takes none of.
 */
const KINDS: Record<RulesetEntityType, KindServices> = {
  abilities: {
    filters: {},
    get: (rulesetId, id) => AbilitiesService.getAbility(rulesetId, id),
    list: (rulesetId, where, pagination) => AbilitiesService.getAbilities(rulesetId, where, pagination),
  },
  aptitudes: {
    create: (session, rulesetId, body) => AptitudesService.createAptitude(session, rulesetId, body),
    filters: { scope: z.enum(["feats", "spells"]).optional() },
    get: (rulesetId, id) => AptitudesService.getAptitude(rulesetId, id),
    list: (rulesetId, { scope, ...where }, pagination) =>
      AptitudesService.getAptitudes(
        rulesetId,
        { ...where, scope: filterChoice(scope, ["feats", "spells"]) },
        pagination,
      ),
    remove: (session, rulesetId, id) => AptitudesService.deleteAptitude(session, rulesetId, id),
    update: (session, rulesetId, id, body) => AptitudesService.updateAptitude(session, rulesetId, id, body),
  },
  feats: {
    create: (session, rulesetId, body) => FeatsService.createFeat(session, rulesetId, body),
    filters: { ...POOL_FILTER, family: z.string().optional() },
    get: (rulesetId, id) => FeatsService.getFeat(rulesetId, id),
    grouped: (rulesetId, { aptitudeId, childOnly, search }, pagination) =>
      FeatsService.getFeatGroups(rulesetId, { aptitudeId: filterText(aptitudeId), childOnly, search }, pagination),
    list: (rulesetId, { aptitudeId, family, ...where }, pagination) =>
      FeatsService.getFeats(
        rulesetId,
        { ...where, aptitudeId: filterText(aptitudeId), family: filterText(family) },
        pagination,
      ),
    remove: (session, rulesetId, id) => FeatsService.deleteFeat(session, rulesetId, id),
    update: (session, rulesetId, id, body) => FeatsService.updateFeat(session, rulesetId, id, body),
  },
  items: {
    create: (session, rulesetId, body) => ItemsService.createItem(session, rulesetId, body),
    duplicate: (session, rulesetId, id, body) => ItemsService.duplicateItem(session, rulesetId, id, body),
    filters: {
      isTemplate: z
        .enum(["true", "false"])
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
    },
    get: (rulesetId, id) => ItemsService.getItem(rulesetId, id),
    list: (rulesetId, { isTemplate, ...where }, pagination) =>
      ItemsService.getItems(rulesetId, { ...where, isTemplate: filterFlag(isTemplate) }, pagination),
    remove: (session, rulesetId, id) => ItemsService.deleteItem(session, rulesetId, id),
    templates: (rulesetId, type) => ItemsService.getTemplates(rulesetId, type),
    update: (session, rulesetId, id, body) => ItemsService.updateItem(session, rulesetId, id, body),
    variants: (session, rulesetId, id, variants) => ItemsService.createVariants(session, rulesetId, id, variants),
  },
  klasses: {
    create: (session, rulesetId, body) => ClassesService.createClass(session, rulesetId, body),
    filters: KIND_FILTER,
    get: (rulesetId, id) => ClassesService.getClass(rulesetId, id),
    list: (rulesetId, { kind, ...where }, pagination) =>
      ClassesService.getClasses(rulesetId, { ...where, kind: filterText(kind) }, pagination),
    remove: (session, rulesetId, id) => ClassesService.deleteClass(session, rulesetId, id),
    update: (session, rulesetId, id, body) => ClassesService.updateClass(session, rulesetId, id, body),
  },
  languages: {
    create: (session, rulesetId, body) => LanguagesService.createLanguage(session, rulesetId, body),
    filters: {},
    get: (rulesetId, id) => LanguagesService.getLanguage(rulesetId, id),
    list: (rulesetId, where, pagination) => LanguagesService.getLanguages(rulesetId, where, pagination),
    remove: (session, rulesetId, id) => LanguagesService.deleteLanguage(session, rulesetId, id),
    update: (session, rulesetId, id, body) => LanguagesService.updateLanguage(session, rulesetId, id, body),
  },
  mechanics: {
    create: (session, rulesetId, body) => MechanicsService.createMechanic(session, rulesetId, body),
    filters: {},
    get: (rulesetId, id) => MechanicsService.getMechanic(rulesetId, id),
    list: (rulesetId, where, pagination) => MechanicsService.getMechanics(rulesetId, where, pagination),
    remove: (session, rulesetId, id) => MechanicsService.deleteMechanic(session, rulesetId, id),
    update: (session, rulesetId, id, body) => MechanicsService.updateMechanic(session, rulesetId, id, body),
  },
  powers: {
    create: (session, rulesetId, body) => PowersService.createPower(session, rulesetId, body),
    filters: { ...POOL_FILTER, level: z.coerce.number().optional() },
    get: (rulesetId, id) => PowersService.getPower(rulesetId, id),
    list: (rulesetId, { aptitudeId, level, ...where }, pagination) =>
      PowersService.getPowers(
        rulesetId,
        { ...where, aptitudeId: filterText(aptitudeId), level: filterNumber(level) },
        pagination,
      ),
    remove: (session, rulesetId, id) => PowersService.deletePower(session, rulesetId, id),
    update: (session, rulesetId, id, body) => PowersService.updatePower(session, rulesetId, id, body),
  },
  races: {
    create: (session, rulesetId, body) => RacesService.createRace(session, rulesetId, body),
    filters: KIND_FILTER,
    get: (rulesetId, id) => RacesService.getRace(rulesetId, id),
    list: (rulesetId, { kind, ...where }, pagination) =>
      RacesService.getRaces(rulesetId, { ...where, kind: filterText(kind) }, pagination),
    remove: (session, rulesetId, id) => RacesService.deleteRace(session, rulesetId, id),
    update: (session, rulesetId, id, body) => RacesService.updateRace(session, rulesetId, id, body),
  },
  saves: {
    create: (session, rulesetId, body) => SavesService.createSave(session, rulesetId, body),
    filters: {},
    get: (rulesetId, id) => SavesService.getSave(rulesetId, id),
    list: (rulesetId, where, pagination) => SavesService.getSaves(rulesetId, where, pagination),
    remove: (session, rulesetId, id) => SavesService.deleteSave(session, rulesetId, id),
    update: (session, rulesetId, id, body) => SavesService.updateSave(session, rulesetId, id, body),
  },
  skills: {
    create: (session, rulesetId, body) => SkillsService.createSkill(session, rulesetId, body),
    filters: {},
    get: (rulesetId, id) => SkillsService.getSkill(rulesetId, id),
    list: (rulesetId, where, pagination) => SkillsService.getSkills(rulesetId, where, pagination),
    remove: (session, rulesetId, id) => SkillsService.deleteSkill(session, rulesetId, id),
    update: (session, rulesetId, id, body) => SkillsService.updateSkill(session, rulesetId, id, body),
  },
};

/** Every entity kind's type, which the routes by kind take. */
export const ENTITY_TYPES: readonly RulesetEntityType[] = RULESET_ENTITY_TYPES;

/**
 * A ruleset's entities by their kind (`type`, its table), whatever it is: each answered by its kind's service. An
 * action a kind has none of (an ability's create, a race's templates) is refused as not found.
 */
class EntitiesService {
  /** A kind's action (`action`): refused as not found when it has none. */
  private actionOf<A extends keyof KindServices>(type: RulesetEntityType, action: A): NonNullable<KindServices[A]> {
    const found = this.kindOf(type)[action];
    if (!found) throw new NotFoundError(`No ${String(action)} for ${type}`);
    return found;
  }

  /** A kind's services. */
  private kindOf(type: RulesetEntityType) {
    return KINDS[type];
  }

  /**
   * A list's filters, its kind's (`type`): read by their schemas, refused as invalid, by key, as a route's validation
   * refuses a query, when one isn't its kind's or isn't of its type.
   */
  private readFilters(type: RulesetEntityType, filters: Record<string, unknown>) {
    const { filters: shape } = this.kindOf(type);
    const unknown = Object.keys(filters).filter((key) => !Object.hasOwn(shape, key));
    if (unknown.length > 0) {
      const issues = unknown.map((key) => ({ category: key, message: `${type} take no ${key} filter` }));
      throw new RulesError("invalid", "Request validation failed", issues);
    }
    return RulesError.parse(z.object(shape), filters);
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
    return await this.kindOf(type).list(rulesetId, { ...where, ...this.readFilters(type, filters) }, pagination);
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
    const grouped = this.actionOf(type, "grouped");
    return await grouped(rulesetId, { ...where, ...this.readFilters(type, filters) }, pagination);
  }

  async getTemplates(rulesetId: string, type: RulesetEntityType, templateType: string | undefined) {
    return await this.actionOf(type, "templates")(rulesetId, templateType);
  }

  async updateEntity(session: Session, rulesetId: string, type: RulesetEntityType, entityId: string, body: EntityBody) {
    return await this.actionOf(type, "update")(session, rulesetId, entityId, body);
  }
}

export default new EntitiesService();
