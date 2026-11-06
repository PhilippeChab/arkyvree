/** A noun after its indefinite article, by its first letter: "a Cat", "an Owl". */
export function formatWithArticle(noun: string): string {
  return `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
}
