/** What a translator reads: a service's answer, as its method's type says it, awaited. */

/** What a service's method answers, awaited: a translator is typed by it, so a change to it stops the translator. */
export type Answer<F extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<F>>;
