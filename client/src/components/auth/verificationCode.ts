import { VERIFICATION_CODE_LENGTH } from "@/shared/auth.ts";

/** Default value of a code field; React Hook Form copies default values, so sharing it is safe. */
export const EMPTY_VERIFICATION_CODE: string[] = Array.from({ length: VERIFICATION_CODE_LENGTH }, () => "");
