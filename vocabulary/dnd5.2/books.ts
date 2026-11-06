/** The core rules' book, the System Reference Document 5.2.1: the 2024 rules' open content. */
export const CORE_BOOK = "srd";

/**
 * The books the parser reads, by the slug their references' folder takes: the SRD 5.2.1 alone, the only book of the
 * 2024 rules published under an open license.
 */
export const BOOKS = [CORE_BOOK] as const;
