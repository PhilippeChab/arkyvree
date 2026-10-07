import type { Overrides, ScrapedMeta } from "./reference.ts";

export type WizardSchoolReference = {
  _meta: ScrapedMeta<"wizardSchool">;

  raw: {
    name: string;
    description: string;
    prohibitedSchoolCount: number;
  }[];

  overrides?: Overrides<{ description?: string }>;
};
