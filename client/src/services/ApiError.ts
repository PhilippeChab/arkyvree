import type { ErrorJson } from "@/server/errors/index.ts";

export type ApiValidationIssue = NonNullable<ErrorJson["issues"]>[number];

/** A failed API response: its status, the server's error class name, and any validation issues. */
export class ApiError extends Error {
  constructor(message: string, status: number, errorName: string, issues?: ApiValidationIssue[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errorName = errorName;
    this.issues = issues;
  }

  status: number;

  errorName: string;

  issues?: ApiValidationIssue[];
}
