import { stripSeparators } from "@/shared/text.ts";

/**
 * A character component (abilities, skills, combat, etc.): a class instance whose getters the target paths call
 * by name (`PathTraverser.readComponent`).
 */
export type Component = object;

export type Components = Record<string, Component>;

export type TraversePathResult = {
  component: Component | null;
  data: unknown;
  error: string | null;
  key: string;
  object: unknown;
  resolvedPath: string | null;
};

/** The key of `value` whose slug is `slug`: one written its own way, as a spell's property types are (`SPELL_COMPONENT`). */
function keyBySlug(value: Record<string, unknown>, slug: string) {
  return Object.keys(value).find((key) => stripSeparators(key) === slug);
}

/** The entries of `value` that are objects and whose slug starts with `slug` (but isn't it): a skill's subtypes. */
function subtypesOf(value: Record<string, unknown>, slug: string) {
  return Object.entries(value).filter(
    ([key, entry]) =>
      entry !== null &&
      typeof entry === "object" &&
      stripSeparators(key).startsWith(slug) &&
      stripSeparators(key) !== slug,
  );
}

/**
 * Walks a target path through a component's data, element by element: an entry by its slug, or a wildcard (`*`,
 * `prefix*`) over the entries it matches. In a category of `subtypeCategories`, an entry's name also reaches the
 * entries its name starts: a skill's subtypes.
 */
export default class PathTraverser {
  constructor(private readonly subtypeCategories: ReadonlySet<string>) {}

  /** A path that reaches no value, with why. */
  static failed(component: Component | null, key: string, error: string): TraversePathResult[] {
    return [{ component, object: null, data: null, key, resolvedPath: null, error }];
  }

  /**
   * Whether a target path can step into `value`: an object (an array too) or a function, whose keys `in` can test. A
   * path that reaches a primitive, `null` or `undefined` can't go further.
   */
  static isTraversable(value: unknown): value is Record<string, unknown> {
    return (typeof value === "object" && value !== null) || typeof value === "function";
  }

  /**
   * What a component's method `name` returns, called on it: the getter a path category names for its data (checked
   * against the ruleset's components, `ComponentSpec`), or a component's `updateAvailables` after a modifier writes to
   * it. Undefined when it has no such method: a partial set of components (a race's eligibility, a test's) passes plain
   * objects.
   */
  static readComponent(component: Component, name: string): unknown {
    const method: unknown = Reflect.get(component, name);
    return typeof method === "function" ? method.call(component) : undefined;
  }

  /** Each of `entries` traversed with the rest of the path, under its own slug: a skill and its subtypes. */
  private traverseEach(
    component: Component,
    entries: [string, unknown][],
    rest: string[],
    maxDepth: number,
    pathParts: string[],
  ): TraversePathResult[] {
    return entries.flatMap(([key, value]) => {
      const slug = stripSeparators(key);
      return this.traverse(component, rest, value as Record<string, unknown>, slug, maxDepth, [...pathParts, slug]);
    });
  }

  /**
   * A wildcard element (`*`, or `prefix*`): every object entry whose slug starts with the prefix, each traversed with
   * the rest of the path. A matched entry without the next element is a group: its children are tested with a
   * wildcard in turn. A wildcard can't end a path.
   */
  private traverseWildcard(
    component: Component,
    next: string,
    rest: string[],
    currentValue: unknown,
    lastKey: string,
    maxDepth: number,
    pathParts: string[],
  ): TraversePathResult[] {
    // A wildcard past nothing fails the path whole (as above); past a value, it matches nothing.
    if (currentValue === null || currentValue === undefined) throw new Error(`Element not found: ${next}`);
    if (!PathTraverser.isTraversable(currentValue)) return [];
    const prefix = next === "*" ? "" : stripSeparators(next.slice(0, -1));
    const results: TraversePathResult[] = [];
    for (const [key, value] of Object.entries(currentValue)) {
      // Skip null values and non-object primitives
      if (value === null || typeof value !== "object") continue;
      const formattedKey = stripSeparators(key);
      if (!formattedKey || (prefix && !formattedKey.startsWith(prefix))) continue;
      if (rest.length === 0)
        return PathTraverser.failed(component, lastKey, `Wildcard modifier not supported as last element`);
      const nextElement = stripSeparators(rest[0]);
      // A value without the next path element is a group: recurse with a wildcard into its children.
      const elements = nextElement && !(nextElement in value) ? ["*", ...rest] : rest;
      results.push(...this.traverse(component, elements, value, key, maxDepth, [...pathParts, formattedKey]));
    }
    return results;
  }

  /** The rest of a path (`elements`) walked from `currentValue`, which `pathParts` reached. */
  traverse(
    component: Component,
    elements: string[],
    currentValue: unknown,
    lastKey: string,
    maxDepth: number = 0,
    pathParts: string[] = [],
  ): TraversePathResult[] {
    if (maxDepth > 10) return PathTraverser.failed(component, lastKey, `Max depth reached`);
    maxDepth++;
    const [next, ...rest] = elements;
    if (next === "*" || next.endsWith("*"))
      return this.traverseWildcard(component, next, rest, currentValue, lastKey, maxDepth, pathParts);

    const formattedKey = stripSeparators(next);
    // Only an entry of a category with subtypes (`subtypeCategories`) also reaches them by its name: the entries its
    // name starts. Anywhere else, a name another starts is another entry, checked by its family's group if it has one
    const reachesSubtypes = rest.length > 0 && this.subtypeCategories.has(pathParts[0]);
    if (!formattedKey) return PathTraverser.failed(component, formattedKey, `Element not found: ${next}`);
    // A path that steps past a value (`abilities.strength.total.x`) fails whole, wildcard branches and all:
    // traversePathInit answers the throw with the path's one error.
    if (!PathTraverser.isTraversable(currentValue)) throw new Error(`Element not found: ${next}`);
    // The entry whose slug the element is: its key, or one written its own way
    const key = formattedKey in currentValue ? formattedKey : keyBySlug(currentValue, formattedKey);
    if (key === undefined) {
      // A skill not found may name only its subtypes ("knowledge" for "knowledgearcana", "knowledgehistory"…):
      // expand to all of them like an implicit wildcard
      const prefixMatches = reachesSubtypes ? subtypesOf(currentValue, formattedKey) : [];
      if (prefixMatches.length === 0)
        return PathTraverser.failed(component, formattedKey, `Element not found: ${next}`);
      return this.traverseEach(component, prefixMatches, rest, maxDepth, pathParts);
    }
    const subtypeMatches = reachesSubtypes ? subtypesOf(currentValue, formattedKey) : [];
    if (subtypeMatches.length > 0) {
      // The skill itself, then its subtypes.
      return this.traverseEach(component, [[key, currentValue[key]], ...subtypeMatches], rest, maxDepth, pathParts);
    }

    const path = [...pathParts, formattedKey];
    if (rest.length !== 0) return this.traverse(component, rest, currentValue[key], key, maxDepth, path);
    // A leaf that holds no value (an unset age, a bow's Strength share) is reached by nothing: a modifier on it is
    // inactive, a requirement on it unmet
    if (currentValue[key] === null || currentValue[key] === undefined) return [];

    return [
      {
        component,
        object: currentValue,
        data: currentValue[key],
        key,
        resolvedPath: path.join("."),
        error: null,
      },
    ];
  }
}
