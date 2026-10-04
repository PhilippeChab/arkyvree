/** A noun after its indefinite article, by its first letter: "a Cat", "an Owl". */
export const formatWithArticle = (noun: string): string => `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
