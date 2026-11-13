import type { CowData } from "@/engine/core/cow/index.ts";
import type { TargetPaths } from "@/engine/core/paths/CategoryPaths.ts";
import { isTemplateValue } from "@/shared/customization/templateExpression.ts";
import type { NameBinding } from "@/shared/relations.ts";
import { stripSeparators } from "@/shared/text.ts";

import TemplatePaths from "./TemplatePaths.ts";

/** What a reader reads of a row: its target and its value, as stored. */
interface BoundRow {
  target: string | null;
  value: string | null;
}

/** What reading a row by its bindings gives: the row in the view's names, and what of it is gone. */
interface ReadRow<R> {
  /** The binding of a path whose entity is gone: the row names nothing any more */
  gone?: NameBinding;
  /** The binding of a value whose entity is gone: the row's value is nobody's name any more */
  goneValue?: NameBinding;
  row: R;
}

/** What a view shows of its entities, which a reader follows a binding to. */
interface ShownEntities {
  /** The rulesets the view is composed of: its own and its source chain's */
  chain: ReadonlySet<string>;
  /** The view's entities' names, by kind then id */
  names: ReadonlyMap<string, ReadonlyMap<string, string>>;
  /** The kinds a name pairs across books (a feat reprinted in two) */
  paired: ReadonlySet<string>;
  /** How each segment of a path writes its entity's name, where not as its plain slug */
  paths?: Pick<TargetPaths, "nameSegments">;
}

/**
 * A stored row read in a ruleset's view by what its names mean (`NameBinding`s), not by its text: each bound entity is
 * followed to what stands for it in the view (`CowData.resolve`: a copy, a winner, the ruleset's own of its name), and
 * the row's text rewritten to that entity's name there. An entity of a ruleset outside the view's chain, of a kind
 * books reprint, pairs with the view's entity of its name, as copy-on-write pairs reprints. A row whose entity nothing
 * stands for is gone: it isn't read by its text, which another entity may have taken since.
 */
export default class NameBindingReader {
  constructor(
    private readonly cow: CowData,
    private readonly shown: ShownEntities,
  ) {}

  /**
   * Whether a binding no longer matches its row's text (the text was changed past it: a fix written straight to the
   * database): the name it was made from isn't what its place holds any more. Such a binding is left aside when read,
   * and replaced by a fill.
   */
  static isStale(row: BoundRow, binding: NameBinding, paths?: Pick<TargetPaths, "nameSegments">): boolean {
    const field = binding.field === "value" ? "value" : "target";
    const text = row[field];
    if (text === null) return true;
    if (field === "value" && !isTemplateValue(text)) return text !== binding.name;
    const path = TemplatePaths.list(field, text)[binding.path];
    const held = path?.split(".")[binding.segment];
    if (path === undefined || held === undefined) return true;
    if (binding.kind !== "entity") return stripSeparators(held) !== binding.name;
    const named = paths?.nameSegments(path).find((candidate) => candidate.segment === binding.segment);
    return held !== (named?.slugOf ?? stripSeparators)(binding.name);
  }

  /** The name the view shows a bound entity under: what stands for it, or its namesake for one out of the chain. */
  private nameOf(binding: NameBinding): string | undefined {
    const names = this.shown.names.get(binding.entityType);
    if (!names || binding.entityId === null) return undefined;
    const name = names.get(this.cow.resolve(binding.entityId));
    if (name !== undefined) return name;
    const outside = binding.rulesetId !== null && !this.shown.chain.has(binding.rulesetId);
    if (!outside || !this.shown.paired.has(binding.entityType)) return undefined;
    for (const candidate of names.values()) if (candidate === binding.name) return candidate;
    return undefined;
  }

  /** How a path's segment writes an entity's name: its category's way, or the name's plain slug. */
  private slugAt(path: string, segment: number, name: string): string {
    const named = this.shown.paths?.nameSegments(path).find((candidate) => candidate.segment === segment);
    return (named?.slugOf ?? stripSeparators)(name);
  }

  /**
   * The row as the view reads it: its text with each bound entity under the view's name for it, the same row when
   * nothing differs; with the binding of a path whose entity is gone, or of a value whose entity is. A binding its
   * text no longer matches (the text was changed past it) is left aside, and the text read as it is.
   */
  read<R extends BoundRow>(row: R, bindings: readonly NameBinding[] | undefined): ReadRow<R> {
    let read = row;
    let goneValue: NameBinding | undefined;
    for (const binding of bindings ?? []) {
      if (binding.kind !== "entity") continue;
      const field = binding.field === "value" ? "value" : "target";
      const text = read[field];
      if (text === null) continue;
      if (NameBindingReader.isStale(read, binding, this.shown.paths)) continue;
      if (field === "value" && !isTemplateValue(text)) {
        // A value that is an entity's name, whole
        const name = this.nameOf(binding);
        if (name === undefined) goneValue = binding;
        else if (name !== text) read = { ...read, value: name };
        continue;
      }
      const path = TemplatePaths.list(field, text)[binding.path];
      const segments = path.split(".");
      const name = this.nameOf(binding);
      if (name === undefined) return { gone: binding, row };
      const slug = this.slugAt(path, binding.segment, name);
      if (segments[binding.segment] === slug) continue;
      segments[binding.segment] = slug;
      read = { ...read, [field]: TemplatePaths.replace(field, text, binding.path, segments.join(".")) };
    }
    return { ...(goneValue && { goneValue }), row: read };
  }
}
