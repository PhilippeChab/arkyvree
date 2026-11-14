import type { TargetPaths } from "@/engine/core/paths/CategoryPaths.ts";
import type { NamedSegment } from "@/engine/core/paths/PathCategory.ts";
import type { RulesetData } from "@/engine/core/view/index.ts";
import type { NameBinding } from "@/shared/relations.ts";
import { stripSeparators, stripSeparatorsDroppingAccents } from "@/shared/text.ts";

import NameBindingReader from "./NameBindingReader.ts";
import TemplatePaths from "./TemplatePaths.ts";

/** What a row's text becomes under the keys that keep accented letters, and what it can't settle alone. */
interface RowRekey {
  /** The new name of each group binding at a place whose text changed, by the binding's id */
  groups: Map<string, string>;
  target: string | null;
  unsettled: UnsettledKey[];
  value: string | null;
}

/** A row as stored, whose text a rekey reads: its id, its target and its value. */
interface StoredRow {
  id: string;
  target: string | null;
  value: string | null;
}

/** A row's rewrites under the keys that keep accented letters: each row whose text changes, and what none settles. */
export interface KeysRekey {
  /** The new name of each group binding at a place whose text changed, by the binding's id */
  groups: Map<string, string>;
  /** Each row whose text changes, by its id: its new target and value */
  rows: Map<string, { target: string | null; value: string | null }>;
  /** The old keys several names now have keys for, which a rekey leaves as they are */
  unsettled: UnsettledKey[];
}

/** An old key a row's text holds that several names of the view had, each with its own key now. */
export interface UnsettledKey {
  field: "target" | "value";
  held: string;
  keys: string[];
  rowId: string;
}

/** A Latin letter past ASCII ("é", "ß"): a text that holds one is written under the new keys, which an old key never is. */
const ACCENTED_LATIN = /(?!\p{ASCII})\p{scx=Latin}/u;
/** The fields of a row a key sits in. */
const FIELDS = ["target", "value"] as const;

/** `name` and each base a " (" ends: a skill's family ("Représentation (Chant)" is of "Représentation"). */
function familiesOf(name: string): string[] {
  const names = [name];
  for (let idx = name.indexOf(" ("); idx > 0; idx = name.indexOf(" (", idx + 1)) names.push(name.slice(0, idx));
  return names;
}

/**
 * The text of the rows saved before a name's key kept its accented Latin letters, moved to the keys that keep them
 * ("skills.discrtion.misc" → "skills.discrétion.misc"), in a ruleset's view (`rulesetData`), by what its paths say
 * names an entity (`paths`). A segment bound to an entity takes the key of the name it was bound under, which its old
 * text held (`NameBindingReader.isStale` reads that name either way), so its bindings stay as they are. Any other
 * (unbound, or bound to a group: a family, a name a wildcard follows) takes the key of the one name of the view whose
 * old key it holds, when it names nothing under the new keys; a prefix a wildcard ends ("armedeprdilection*") the new
 * key of the same start of those names. An old key several names now have keys for is left, and listed.
 */
export default class LegacyKeys {
  constructor(
    private readonly rulesetData: RulesetData,
    private readonly paths: Pick<TargetPaths, "nameSegments">,
  ) {}

  /** A bound entity's segment: the key of its name when its text holds that name's old key, which differs. */
  private static boundKey(named: NamedSegment, binding: NameBinding, held: string): string | undefined {
    const legacy = NameBindingReader.slugOf(named, binding.name, stripSeparatorsDroppingAccents);
    const key = NameBindingReader.slugOf(named, binding.name);
    return held === legacy && legacy !== key ? key : undefined;
  }

  /** The new keys of the names of a kind (and their families) whose old key `matches`, against what they are now. */
  private keysOf(named: NamedSegment, matches: (name: string, legacy: string) => string | undefined): Set<string> {
    const keys = new Set<string>();
    for (const row of this.rulesetData.rows(named.entityType)) {
      for (const name of familiesOf(row.name)) {
        const key = matches(name, NameBindingReader.slugOf(named, name, stripSeparatorsDroppingAccents));
        if (key !== undefined) keys.add(key);
      }
    }
    return keys;
  }

  /**
   * A wildcard's prefix (`prefix`, its text before "*"): the new key of the start of each name whose old key starts
   * with it, its shortest start of that old key; undefined when that's the prefix itself, several when they differ.
   */
  private prefixKey(named: NamedSegment, prefix: string): string | string[] | undefined {
    const held = stripSeparatorsDroppingAccents(prefix);
    if (!held) return undefined;
    const keys = this.keysOf(named, (name, legacy) => {
      if (!legacy.startsWith(held)) return undefined;
      for (let end = 1; end <= name.length; end++) {
        const start = name.slice(0, end);
        if (NameBindingReader.slugOf(named, start, stripSeparatorsDroppingAccents) === held)
          return NameBindingReader.slugOf(named, start);
      }
      return undefined;
    });
    // A prefix that still starts every name it did stays; one that starts some of them only is the person's to settle
    if (keys.size === 0 || (keys.size === 1 && keys.has(stripSeparators(prefix)))) return undefined;
    return keys.size === 1 ? `${[...keys][0]}*` : [...keys].map((key) => `${key}*`);
  }

  /** One path of a row's field (`field`, its `index`th) under the new keys, segment by named segment, into `rekey`. */
  private rekeyPath(
    row: StoredRow,
    place: { field: "target" | "value"; index: number; path: string },
    bindings: readonly NameBinding[],
    rekey: RowRekey,
  ) {
    const { field, index, path } = place;
    const segments = path.split(".");
    let changed = false;
    for (const named of this.paths.nameSegments(path)) {
      const held = segments[named.segment];
      if (!held) continue;
      const binding = bindings.find(
        (bound) => bound.field === field && bound.path === index && bound.segment === named.segment,
      );
      const key = binding?.kind === "entity" ? LegacyKeys.boundKey(named, binding, held) : this.textKey(named, held);
      if (key === undefined) continue;
      if (Array.isArray(key)) {
        rekey.unsettled.push({ field, held, keys: key, rowId: row.id });
        continue;
      }
      segments[named.segment] = key;
      changed = true;
      if (binding?.kind === "group") rekey.groups.set(binding.id, stripSeparators(key));
    }
    if (changed) rekey[field] = TemplatePaths.replace(field, rekey[field]!, index, segments.join("."));
  }

  /** One row's text under the new keys: each path of its target and its value. */
  private rekeyRow(row: StoredRow, bindings: readonly NameBinding[]): RowRekey {
    const rekey: RowRekey = { groups: new Map(), target: row.target, unsettled: [], value: row.value };
    for (const field of FIELDS) {
      for (const [index, path] of TemplatePaths.list(field, row[field]).entries())
        this.rekeyPath(row, { field, index, path }, bindings, rekey);
    }
    return rekey;
  }

  /**
   * An unbound segment's (or a group's) new key: the one name of the view whose old key it holds, its family's too,
   * when it names nothing under the new keys; several when several did, or when it names an entity now as well. None
   * for one written under the new keys (an accented letter in it), which a second run leaves as it is.
   */
  private textKey(named: NamedSegment, held: string): string | string[] | undefined {
    // Written under the new keys already (after the deploy): never an old key, whatever it names now
    if (ACCENTED_LATIN.test(held)) return undefined;
    if (held.endsWith("*")) return this.prefixKey(named, held.slice(0, -1));
    if (held.includes("*")) return undefined;
    const slug = stripSeparators(held);
    const legacy = stripSeparatorsDroppingAccents(held);
    const keys = this.keysOf(named, (name, old) =>
      old === legacy ? NameBindingReader.slugOf(named, name) : undefined,
    );
    keys.delete(slug);
    const shown = this.keysOf(named, (name) => NameBindingReader.slugOf(named, name));
    // One that names an entity now, and was an accented name's old key too ("lan", "Élan"'s, beside a skill "Lan"): the
    // person's to settle
    if (shown.has(slug)) return keys.size === 0 ? undefined : [slug, ...keys];
    if (keys.size === 0) return undefined;
    return keys.size === 1 ? [...keys][0] : [...keys];
  }

  /** The rows' (`rows`, as stored, with their `bindings`) text under the new keys: what changes, and what none settles. */
  plan(rows: readonly StoredRow[], bindings: readonly NameBinding[]): KeysRekey {
    const byRow = Map.groupBy(bindings, (binding) => (binding.modifierId ?? binding.requirementId)!);
    const plan: KeysRekey = { groups: new Map(), rows: new Map(), unsettled: [] };
    for (const row of rows) {
      const { groups, target, unsettled, value } = this.rekeyRow(row, byRow.get(row.id) ?? []);
      plan.unsettled.push(...unsettled);
      for (const [id, name] of groups) plan.groups.set(id, name);
      if (target !== row.target || value !== row.value) plan.rows.set(row.id, { target, value });
    }
    return plan;
  }
}
