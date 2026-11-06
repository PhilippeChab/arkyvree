/** A creature's size, as the SRD 5.2.1 names them, smallest first: a species' is Small or Medium. */

/** A creature's size. */
export type SizeType = (typeof SIZE_OPTIONS)[number];

/** Every size, smallest first. */
export const SIZE_OPTIONS = ["Tiny", "Small", "Medium", "Large", "Huge", "Gargantuan"] as const;
