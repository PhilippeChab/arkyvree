/**
 * What's built once, by what it is: a book's seeds and a reference's keep what they build in one, as the references
 * they build it from are loaded once.
 */
export class Memos {
  /** What's built, by what it is. */
  private readonly built = new Map<string, unknown>();

  /** What `build` builds, once: the same each time `key` asks for it. */
  of<T>(key: string, build: () => T): T {
    if (!this.built.has(key)) this.built.set(key, build());
    return this.built.get(key) as T;
  }
}
