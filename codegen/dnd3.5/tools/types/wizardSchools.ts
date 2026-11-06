import type { Overrides, ScrapedMeta } from "@/codegen/core/references/types.ts";

export interface WizardSchoolReference {
  _meta: ScrapedMeta<"wizardSchool">;

  /** Each school as the seeds make it: its overrides applied */
  mapping: Record<string, { description: string }>;

  overrides?: Overrides<{ description?: string }>;

  raw: {
    description: string;
    name: string;
    prohibitedSchoolCount: number;
  }[];
}
