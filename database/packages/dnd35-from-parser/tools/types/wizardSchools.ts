import type { Overrides, ScrapedMeta } from "./reference.ts";

export type WizardSchoolReference = {
  _meta: ScrapedMeta<"wizardSchool">;

  overrides?: Overrides<{ description?: string }>;

  raw: {
    description: string;
    name: string;
    prohibitedSchoolCount: number;
  }[];
};
