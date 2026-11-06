import type { BaseRules } from "@/shared/enums.ts";

/**
 * The base rules the D&D 5th Edition content is written for, its 2024 rules as the SRD 5.2.1 gives them: its
 * rulesets', and what its seeders and its codegen ask the engine by, which answers with its own module's types for them.
 */
export const DND52_BASE_RULES = "Dungeons & Dragons: 5.2" satisfies BaseRules;
