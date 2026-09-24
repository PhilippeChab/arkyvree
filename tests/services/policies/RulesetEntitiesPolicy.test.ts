import RulesetEntitiesPolicy from "@/server/services/policies/RulesetEntitiesPolicy.ts";
import type { Session, Skill, Feat, Power, Item, Race, Language, Klass, Aptitude } from "@/shared/relations.ts";
import { describe, test, expect } from "bun:test";

describe("RulesetEntitiesPolicy", () => {
  const createSession = (userId: string): Session => ({
    id: "session-123",
    userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const createSkill = (): Skill => ({
    id: "skill-123",
    rulesetId: "ruleset-123",
    campaignId: null,
    name: "Test Skill",
    description: "Test description",
    primaryAbilityId: "00000000-0000-0000-0000-000000000001",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  });

  const createFeat = (): Feat => ({
    id: "feat-123",
    rulesetId: "ruleset-123",
    campaignId: null,
    name: "Test Feat",
    description: "Test description",
    stackable: false,
    selectable: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  });

  const createPower = (): Power => ({
    id: "power-123",
    rulesetId: "ruleset-123",
    campaignId: null,
    name: "Test Power",
    description: "Test description",
    saveId: null,
    saveEffect: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  });

  const createItem = (): Item => ({
    id: "item-123",
    rulesetId: "ruleset-123",
    campaignId: null,
    sourceItemId: null,
    isTemplate: false,
    name: "Test Item",
    description: "Test description",
    weight: null,
    costGp: null,
    type: null,
    slot: "Other",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  });

  const createRace = (): Race => ({
    id: "race-123",
    rulesetId: "ruleset-123",
    campaignId: null,
    name: "Test Race",
    description: "Test description",
    size: "Medium",
    baseSpeed: 30,
    parentId: null,
    kind: "pc",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  });

  const createLanguage = (): Language => ({
    id: "language-123",
    rulesetId: "ruleset-123",
    campaignId: null,
    name: "Test Language",
    description: "Test description",
    type: "standard",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  });

  const createKlass = (): Klass => ({
    id: "klass-123",
    rulesetId: "ruleset-123",
    campaignId: null,
    name: "Test Class",
    description: "Test description",
    hd: 10,
    parentId: null,
    kind: "pc",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  });

  const createAptitude = (): Aptitude => ({
    id: "aptitude-123",
    rulesetId: "ruleset-123",
    campaignId: null,
    name: "Test Aptitude",
    description: "Test description",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedAt: null,
  });

  describe("canCreate", () => {
    test("should return true for Skill", () => {
      const session = createSession("user-123");
      const skill = createSkill();
      const policy = new RulesetEntitiesPolicy(session, skill);

      expect(policy.canCreate()).toBe(true);
    });

    test("should return true for Feat", () => {
      const session = createSession("user-123");
      const feat = createFeat();
      const policy = new RulesetEntitiesPolicy(session, feat);

      expect(policy.canCreate()).toBe(true);
    });

    test("should return true for all entity types", () => {
      const session = createSession("user-123");

      const entities = [
        createSkill(),
        createFeat(),
        createPower(),
        createItem(),
        createRace(),
        createLanguage(),
        createKlass(),
        createAptitude(),
      ];

      for (const entity of entities) {
        const policy = new RulesetEntitiesPolicy(session, entity);
        expect(policy.canCreate()).toBe(true);
      }
    });
  });

  describe("canRead", () => {
    test("should return true for Power", () => {
      const session = createSession("user-123");
      const power = createPower();
      const policy = new RulesetEntitiesPolicy(session, power);

      expect(policy.canRead()).toBe(true);
    });

    test("should return true for all entity types", () => {
      const session = createSession("user-123");

      const entities = [
        createSkill(),
        createFeat(),
        createPower(),
        createItem(),
        createRace(),
        createLanguage(),
        createKlass(),
        createAptitude(),
      ];

      for (const entity of entities) {
        const policy = new RulesetEntitiesPolicy(session, entity);
        expect(policy.canRead()).toBe(true);
      }
    });
  });

  describe("canUpdate", () => {
    test("should return true for Item", () => {
      const session = createSession("user-123");
      const item = createItem();
      const policy = new RulesetEntitiesPolicy(session, item);

      expect(policy.canUpdate()).toBe(true);
    });

    test("should return true for all entity types", () => {
      const session = createSession("user-123");

      const entities = [
        createSkill(),
        createFeat(),
        createPower(),
        createItem(),
        createRace(),
        createLanguage(),
        createKlass(),
        createAptitude(),
      ];

      for (const entity of entities) {
        const policy = new RulesetEntitiesPolicy(session, entity);
        expect(policy.canUpdate()).toBe(true);
      }
    });
  });

  describe("canDelete", () => {
    test("should return true for Race", () => {
      const session = createSession("user-123");
      const race = createRace();
      const policy = new RulesetEntitiesPolicy(session, race);

      expect(policy.canDelete()).toBe(true);
    });

    test("should return true for all entity types", () => {
      const session = createSession("user-123");

      const entities = [
        createSkill(),
        createFeat(),
        createPower(),
        createItem(),
        createRace(),
        createLanguage(),
        createKlass(),
        createAptitude(),
      ];

      for (const entity of entities) {
        const policy = new RulesetEntitiesPolicy(session, entity);
        expect(policy.canDelete()).toBe(true);
      }
    });
  });

  describe("consistency across all methods", () => {
    test("should always return true for all CRUD operations on any entity", () => {
      const session = createSession("user-123");
      const language = createLanguage();
      const policy = new RulesetEntitiesPolicy(session, language);

      expect(policy.canCreate()).toBe(true);
      expect(policy.canRead()).toBe(true);
      expect(policy.canUpdate()).toBe(true);
      expect(policy.canDelete()).toBe(true);
    });
  });
});
