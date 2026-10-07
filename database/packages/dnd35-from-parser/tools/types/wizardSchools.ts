import type { Overrides, ScrapedMeta } from "./reference.ts";

export type WizardSchoolReference = {
  _meta: ScrapedMeta<"wizardSchool">;

  /** Each school as the seeds make it: its overrides applied */
  mapping: Record<string, { description: string }>;

  overrides?: Overrides<{ description?: string }>;

  raw: {
    description: string;
    name: string;
    prohibitedSchoolCount: number;
  }[];
};
