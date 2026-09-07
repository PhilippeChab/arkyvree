import { db as globalDb } from "@/server/database/index.ts";
import { clearRequestCache, memoizeRequest } from "@/server/database/requestCache.ts";
import { currentCowContext } from "@/server/services/rulesets/cowContext.ts";
import type { IdResolveMap } from "@/server/services/rulesets/cow.ts";

// Inlined to avoid an initialization-time cycle with cow.ts (which imports
// this file). Remaps FK references on each row through the override map so
// consumers comparing row.fooId against post-COW ids get a hit even when the
// row was fetched from an ancestor.
//
// Skips the row's own `id` — identity, not a reference. Remapping id would
// produce Frankenrows (ancestor's columns with a post-COW id), breaking any
// downstream query that keys off the row's real DB identity. The input Proxy
// (`canonicalizeIdFields`) already handles the by-id findOne case: a pre-COW
// id in WHERE gets remapped to post-COW before the query, so the fetched
// row naturally has id = post-COW.
function resolveRowOverrides<T extends Record<string, unknown>>(
  rows: T[],
  overrideMap: IdResolveMap,
): T[] {
  if (overrideMap.size === 0) return rows;
  return rows.map((row) => {
    const resolved = { ...row } as Record<string, unknown>;
    for (const [key, value] of Object.entries(resolved)) {
      if (key === "id") continue;
      if (typeof value === "string" && overrideMap.has(value)) {
        resolved[key] = overrideMap.get(value);
      }
    }
    return resolved as T;
  });
}

// Canonicalize any `id`, `*Id`, `ids`, `*Ids` string fields in a where/values
// object through the override map. Allocates lazily — returns the same object
// reference when nothing changes, so hot-path calls with no COW overrides
// stay zero-alloc. Non-entity ids (characterId, userId, sessionId) are safe
// no-ops because they never appear in overrideMap.
//
// Fields whose name starts with `exclude` are left alone — exclusion lists
// (e.g. `excludeIds`) carry pre-COW loser ids intentionally, and canonicalizing
// them to post-COW winners defeats the purpose of the exclusion.
function canonicalizeIdFields(
  obj: Record<string, unknown>,
  overrideMap: IdResolveMap,
): Record<string, unknown> {
  let out: Record<string, unknown> | null = null;
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith("exclude")) continue;
    if (typeof value === "string" && (key === "id" || key.endsWith("Id"))) {
      const mapped = overrideMap.get(value);
      if (mapped !== undefined && mapped !== value) {
        if (!out) out = { ...obj };
        out[key] = mapped;
      }
    } else if (Array.isArray(value) && (key === "ids" || key.endsWith("Ids"))) {
      let arrChanged = false;
      const mappedArr = (value as unknown[]).map((v) => {
        if (typeof v === "string") {
          const m = overrideMap.get(v);
          if (m !== undefined && m !== v) { arrChanged = true; return m; }
        }
        return v;
      });
      if (arrChanged) {
        if (!out) out = { ...obj };
        out[key] = mappedArr;
      }
    }
  }
  return out ?? obj;
}

// Walks args[1..] and canonicalizes plain-object entries in place of the
// original. Used to auto-normalize entity ids in where / values arguments
// before the repo method runs, so callers never have to pre-canonicalize
// when the active cowContext provides an overrideMap.
function canonicalizeArgs(args: unknown[]): unknown[] {
  const cow = currentCowContext();
  if (!cow || cow.idResolveMap.size === 0) return args;
  const map = cow.idResolveMap;
  let outArgs: unknown[] | null = null;
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (!arg || typeof arg !== "object" || Array.isArray(arg)) continue;
    const replaced = canonicalizeIdFields(arg as Record<string, unknown>, map);
    if (replaced !== arg) {
      if (!outArgs) outArgs = args.slice();
      outArgs[i] = replaced;
    }
  }
  return outArgs ?? args;
}

// Stable short id per cowData (identity-based via idResolveMap reference) so
// the request-dedup cache key distinguishes two different cowContexts in the
// same request. Without this, switching context between calls would let a
// resolved-cached promise leak into a caller expecting a different mapping.
const cowIdCache = new WeakMap<IdResolveMap, string>();
let cowIdCounter = 0;
function getCowId(idResolveMap: IdResolveMap): string {
  let id = cowIdCache.get(idResolveMap);
  if (!id) {
    id = String(++cowIdCounter);
    cowIdCache.set(idResolveMap, id);
  }
  return id;
}
import AbilitiesRepository from "@/server/repositories/AbilitiesRepository.ts";
import ActivitiesRepository from "@/server/repositories/ActivitiesRepository.ts";
import AttachmentsRepository from "@/server/repositories/AttachmentsRepository.ts";
import BlobsRepository from "@/server/repositories/BlobsRepository.ts";
import NotificationsRepository from "@/server/repositories/NotificationsRepository.ts";
import OauthAccountsRepository from "@/server/repositories/OauthAccountsRepository.ts";
import AptitudesRepository from "@/server/repositories/AptitudesRepository.ts";
import CampaignsRepository from "@/server/repositories/CampaignsRepository.ts";
import ContributorsRepository from "@/server/repositories/ContributorsRepository.ts";
import CharacterContributorsRepository from "@/server/repositories/CharacterContributorsRepository.ts";
import CharacterAbilitiesRepository from "@/server/repositories/CharacterAbilitiesRepository.ts";
import CharacterInventoryRepository from "@/server/repositories/CharacterInventoryRepository.ts";
import CharacterLanguagesRepository from "@/server/repositories/CharacterLanguagesRepository.ts";
import CharacterLevelFeatsRepository from "@/server/repositories/CharacterLevelFeatsRepository.ts";
import CharacterLevelSkillsRepository from "@/server/repositories/CharacterLevelSkillsRepository.ts";
import CharacterLevelPowersRepository from "@/server/repositories/CharacterLevelPowersRepository.ts";
import CharacterLevelsRepository from "@/server/repositories/CharacterLevelsRepository.ts";
import CharactersRepository from "@/server/repositories/CharactersRepository.ts";
import EmailVerificationsRepository from "@/server/repositories/EmailVerificationsRepository.ts";
import EntitySnapshotsRepository from "@/server/repositories/EntitySnapshotsRepository.ts";
import ExportsRepository from "@/server/repositories/ExportsRepository.ts";
import PasswordResetsRepository from "@/server/repositories/PasswordResetsRepository.ts";
import FeatsAptitudesRepository from "@/server/repositories/FeatsAptitudesRepository.ts";
import FeatsRepository from "@/server/repositories/FeatsRepository.ts";
import InvitesRepository from "@/server/repositories/InvitesRepository.ts";
import ItemsRepository from "@/server/repositories/ItemsRepository.ts";
import KlassesRepository from "@/server/repositories/KlassesRepository.ts";
import KlassLevelFeatsRepository from "@/server/repositories/KlassLevelFeatsRepository.ts";
import KlassLevelPowersRepository from "@/server/repositories/KlassLevelPowersRepository.ts";
import KlassLevelSavesRepository from "@/server/repositories/KlassLevelSavesRepository.ts";
import KlassLevelsRepository from "@/server/repositories/KlassLevelsRepository.ts";
import KlassSkillsRepository from "@/server/repositories/KlassSkillsRepository.ts";
import LanguagesRepository from "@/server/repositories/LanguagesRepository.ts";
import MechanicsRepository from "@/server/repositories/MechanicsRepository.ts";
import ModifiersRepository from "@/server/repositories/ModifiersRepository.ts";
import PlayerCharactersRepository from "@/server/repositories/PlayerCharactersRepository.ts";
import PlayersRepository from "@/server/repositories/PlayersRepository.ts";
import PropertiesRepository from "@/server/repositories/PropertiesRepository.ts";
import RacesRepository from "@/server/repositories/RacesRepository.ts";
import RequirementsRepository from "@/server/repositories/RequirementsRepository.ts";
import RulesetExtensionsRepository from "@/server/repositories/RulesetExtensionsRepository.ts";
import RulesetsRepository from "@/server/repositories/RulesetsRepository.ts";
import SavesRepository from "@/server/repositories/SavesRepository.ts";
import SessionsRepository from "@/server/repositories/SessionsRepository.ts";
import SkillsRepository from "@/server/repositories/SkillsRepository.ts";
import PowersRepository from "@/server/repositories/PowersRepository.ts";
import PowersAptitudesRepository from "@/server/repositories/PowersAptitudesRepository.ts";
import StarredRulesetsRepository from "@/server/repositories/StarredRulesetsRepository.ts";
import UsersRepository from "@/server/repositories/UsersRepository.ts";


/**
 * Wrap a repository in a Proxy that:
 * - Memoizes `find*` method calls within the current request (AsyncLocalStorage-scoped).
 * - Clears the request cache when a write method (`create`, `update`, `archive`,
 *   `delete*`, `save*`, `upsert*`) is called, so subsequent reads aren't stale.
 * - For character-scoped repos, post-processes `find*` results with
 *   `resolveOverrides` using the current cowContext so every *Id field on the
 *   returned row is post-COW without callers remembering to canonicalize.
 *
 * Memoization only activates when the first arg is the global `db` — tx-scoped
 * reads bypass the cache (a tx's uncommitted state must not leak into other
 * contexts sharing the same request).
 *
 * Key shape: `${name}.${methodName}:${stringified args after db}`.
 * Pagination, search, and filter args are all part of the key, so different
 * queries stay distinct. Identical calls (same method, same args) coalesce.
 */
function withRequestCache<T extends object>(name: string, repo: T, opts?: { skipCow?: boolean }): T {
  // Output auto-resolve runs for every repo read inside a cowContext. Any row
  // returned — character-scoped, ruleset-entity, or join — may carry `*Id` FK
  // fields (or its own `id`) that point at pre-COW entities; we remap them to
  // post-COW uniformly. Outside cowContext this is a no-op. For `Paginated`
  // wrappers ({items, page, nextPage}) we recurse into `items`.
  const maybeResolveResult = (result: unknown): unknown => {
    const cow = currentCowContext();
    if (!cow || cow.idResolveMap.size === 0) return result;
    const map = cow.idResolveMap;
    if (Array.isArray(result)) {
      return resolveRowOverrides(result as Record<string, unknown>[], map);
    }
    if (result && typeof result === "object") {
      const obj = result as Record<string, unknown>;
      if (Array.isArray(obj.items)) {
        const items = resolveRowOverrides(obj.items as Record<string, unknown>[], map);
        return items === obj.items ? result : { ...obj, items };
      }
      // Only remap DB-row shaped objects (have a string `id` and are plain
      // objects). Skip Set/Map/custom wrappers — e.g. a repo method that
      // returns `Set<string>` or a count object must pass through untouched,
      // since `{ ...set }` collapses the iterable to `{}`.
      if (typeof obj.id === "string" && obj.constructor === Object) {
        return resolveRowOverrides([obj], map)[0];
      }
    }
    return result;
  };
  const isReadMethod = (prop: string) => prop.startsWith("find") || prop === "exists" || prop.startsWith("count");
  // Any new mutating method must match one of these prefixes (or the explicit
  // names below) so the Proxy clears the request cache on call. When adding a
  // new repo method, prefer renaming to an existing prefix (e.g. `update*`)
  // over adding more entries here — the one-offs below are grandfathered in.
  const explicitWriteNames = new Set(["publish", "markRead", "markReadByTarget", "markAllRead", "backfillUserId", "claim"]);
  const isWriteMethod = (prop: string) =>
    prop.startsWith("create") || prop.startsWith("update") || prop.startsWith("archive")
    || prop.startsWith("unarchive") || prop.startsWith("restore") || prop.startsWith("delete")
    || prop.startsWith("save") || prop.startsWith("upsert") || prop.startsWith("insert")
    || prop.startsWith("link") || prop.startsWith("unlink") || prop.startsWith("orphan")
    || explicitWriteNames.has(prop);
  return new Proxy(repo, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function" || typeof prop !== "string") return value;

      if (isReadMethod(prop)) {
        return function (this: unknown, ...args: unknown[]) {
          const dbArg = args[0];
          // Repos marked `skipCow` (EntitySnapshots — the COW mapping table
          // itself) skip both input canonicalization and output resolve.
          // Transforming queries against the mapping through the mapping is
          // self-referential: `sourceEntityId` stores raw pre-COW ids and
          // `forkedEntityId` stores raw post-COW ids by design, so either
          // direction's Proxy remap would corrupt the query.
          const applyResolution = opts?.skipCow
            ? (p: Promise<unknown>) => p
            : (p: Promise<unknown>) => p.then(maybeResolveResult);
          // Canonicalize entity-id inputs (id, *Id, ids, *Ids) through the
          // active cowContext so callers can send pre- or post-COW ids and
          // hit the same query path. No-op outside cowContext.
          const effectiveArgs = opts?.skipCow ? args : canonicalizeArgs(args);
          if (dbArg !== globalDb) {
            // Tx path — bypass dedup entirely.
            return applyResolution(value.apply(target, effectiveArgs) as Promise<unknown>);
          }
          // Stable key over the non-db args. JSON.stringify is safe here because
          // where/pagination params are plain objects/primitives. The cowContext
          // identity is appended so two different cowData instances in the same
          // request don't share a cached resolution.
          let key: string;
          try {
            key = `${name}.${prop}:${JSON.stringify(effectiveArgs.slice(1))}`;
          } catch {
            return applyResolution(value.apply(target, effectiveArgs) as Promise<unknown>);
          }
          const cow = currentCowContext();
          if (cow && cow.idResolveMap.size > 0) {
            key = `${key}|cow:${getCowId(cow.idResolveMap)}`;
          }
          return memoizeRequest(key, () =>
            applyResolution(value.apply(target, effectiveArgs) as Promise<unknown>),
          );
        };
      }

      if (isWriteMethod(prop)) {
        return function (this: unknown, ...args: unknown[]) {
          // Clear before the write so in-flight reads complete against the pre-write
          // state, and clear after so the next read issues a fresh query.
          clearRequestCache();
          // Canonicalize entity-id inputs in where/values args. For stored
          // composite-key rows that remain pre-COW, repos additionally define
          // *IdMatches() predicates that expand to a WHERE IN over all override
          // siblings (see CharacterInventoryRepository.itemIdMatches).
          // skipCow repos (EntitySnapshots) hold raw pre/post-COW ids by
          // design; canonicalizing their write args would corrupt the mapping.
          const effectiveArgs = opts?.skipCow ? args : canonicalizeArgs(args);
          const result = value.apply(target, effectiveArgs);
          if (result && typeof (result as Promise<unknown>).then === "function") {
            (result as Promise<unknown>).finally(() => clearRequestCache());
          }
          return result;
        };
      }

      return value;
    },
  });
}

export const Abilities = withRequestCache("Abilities", new AbilitiesRepository());
export const OauthAccounts = withRequestCache("OauthAccounts", new OauthAccountsRepository());
export const Users = withRequestCache("Users", new UsersRepository());
export const Sessions = withRequestCache("Sessions", new SessionsRepository());
export const Activities = withRequestCache("Activities", new ActivitiesRepository());
export const Notifications = withRequestCache("Notifications", new NotificationsRepository());
export const Characters = withRequestCache("Characters", new CharactersRepository());
export const EmailVerifications = withRequestCache("EmailVerifications", new EmailVerificationsRepository());
export const EntitySnapshots = withRequestCache("EntitySnapshots", new EntitySnapshotsRepository(), { skipCow: true });
export const Exports = withRequestCache("Exports", new ExportsRepository());
export const PasswordResets = withRequestCache("PasswordResets", new PasswordResetsRepository());
export const CharacterLevels = withRequestCache("CharacterLevels", new CharacterLevelsRepository());
export const CharacterLevelSkills = withRequestCache("CharacterLevelSkills", new CharacterLevelSkillsRepository());
export const CharacterLevelPowers = withRequestCache("CharacterLevelPowers", new CharacterLevelPowersRepository());
export const CharacterLevelFeats = withRequestCache("CharacterLevelFeats", new CharacterLevelFeatsRepository());
export const CharacterAbilities = withRequestCache("CharacterAbilities", new CharacterAbilitiesRepository());
export const CharacterInventory = withRequestCache("CharacterInventory", new CharacterInventoryRepository());
export const CharacterLanguages = withRequestCache("CharacterLanguages", new CharacterLanguagesRepository());
export const Campaigns = withRequestCache("Campaigns", new CampaignsRepository());
export const Contributors = withRequestCache("Contributors", new ContributorsRepository());
export const CharacterContributors = withRequestCache("CharacterContributors", new CharacterContributorsRepository());
export const Players = withRequestCache("Players", new PlayersRepository());
export const Skills = withRequestCache("Skills", new SkillsRepository());
export const Powers = withRequestCache("Powers", new PowersRepository());
export const PowersAptitudes = withRequestCache("PowersAptitudes", new PowersAptitudesRepository());
export const Feats = withRequestCache("Feats", new FeatsRepository());
export const FeatsAptitudes = withRequestCache("FeatsAptitudes", new FeatsAptitudesRepository());
export const Races = withRequestCache("Races", new RacesRepository());
export const Items = withRequestCache("Items", new ItemsRepository());
export const Languages = withRequestCache("Languages", new LanguagesRepository());
export const Mechanics = withRequestCache("Mechanics", new MechanicsRepository());
export const Klasses = withRequestCache("Klasses", new KlassesRepository());
export const KlassLevels = withRequestCache("KlassLevels", new KlassLevelsRepository());
export const KlassSkills = withRequestCache("KlassSkills", new KlassSkillsRepository());
export const KlassLevelFeats = withRequestCache("KlassLevelFeats", new KlassLevelFeatsRepository());
export const KlassLevelPowers = withRequestCache("KlassLevelPowers", new KlassLevelPowersRepository());
export const KlassLevelSaves = withRequestCache("KlassLevelSaves", new KlassLevelSavesRepository());
export const Modifiers = withRequestCache("Modifiers", new ModifiersRepository());
export const Properties = withRequestCache("Properties", new PropertiesRepository());
export const Requirements = withRequestCache("Requirements", new RequirementsRepository());
export const RulesetExtensions = withRequestCache("RulesetExtensions", new RulesetExtensionsRepository());
export const Rulesets = withRequestCache("Rulesets", new RulesetsRepository());
export const StarredRulesets = withRequestCache("StarredRulesets", new StarredRulesetsRepository());
export const Saves = withRequestCache("Saves", new SavesRepository());
export const Aptitudes = withRequestCache("Aptitudes", new AptitudesRepository());
export const Invites = withRequestCache("Invites", new InvitesRepository());
export const PlayerCharacters = withRequestCache("PlayerCharacters", new PlayerCharactersRepository());
export const Blobs = withRequestCache("Blobs", new BlobsRepository());
export const Attachments = withRequestCache("Attachments", new AttachmentsRepository());
