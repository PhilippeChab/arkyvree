import type { Overrides, ScrapedMeta } from "@/database/packages/dnd35-from-parser/tools/types/reference.ts";

export type WizardSchoolReference = {
  _meta: ScrapedMeta<"wizardSchool">;

  raw: {
    name: string;
    description: string;
    prohibitedSchoolCount: number;
  }[];

  overrides?: Overrides<{ description?: string }>;
};
