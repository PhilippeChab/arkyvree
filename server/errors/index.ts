import { Sentry } from "@/server/sentry.ts";

export type Code = 400 | 401 | 403 | 404 | 409 | 422 | 429 | 500;

class BaseError extends Error {
  code!: Code;

  static fromError(error: Error) {
    return new InternalError(error.message, { cause: error.cause });
  }
}

export class BadRequestError extends BaseError {
  issues?: ErrorJson["issues"];

  constructor(message = "Bad Request", options?: ErrorOptions & { issues?: ErrorJson["issues"] }) {
    super(message, options);
    this.name = "BadRequestError";
    this.cause = this.cause ?? "badRequest";
    this.code = 400;
    this.issues = options?.issues;
  }
}

export class UnauthorizedError extends BaseError {
  constructor(message = "Unauthorized", options?: ErrorOptions) {
    super(message, options);
    this.name = "UnauthorizedError";
    this.cause = this.cause ?? "unauthorized";
    this.code = 401;
  }
}

export class ForbiddenError extends BaseError {
  constructor(message = "Forbidden", options?: ErrorOptions) {
    super(message, options);
    this.name = "ForbiddenError";
    this.cause = this.cause ?? "forbidden";
    this.code = 403;
  }
}

export class NotFoundError extends BaseError {
  constructor(message = "Not found", options?: ErrorOptions) {
    super(message, options);
    this.name = "NotFoundError";
    this.cause = this.cause ?? "notFound";
    this.code = 404;
  }
}

export class ConflictError extends BaseError {
  constructor(message = "Conflict", options?: ErrorOptions) {
    super(message, options);
    this.name = "ConflictError";
    this.cause = this.cause ?? "conflict";
    this.code = 409;
  }
}

export const STALE_ENTITY_MESSAGE =
  "This was modified by someone else. Please refresh and try again.";

export class UnprocessableEntityError extends BaseError {
  constructor(message = "Unprocessable entity", options?: ErrorOptions) {
    super(message, options);
    this.name = "UnprocessableEntityError";
    this.cause = this.cause ?? "unprocessableEntity";
    this.code = 422;
  }
}

export class TooManyRequestsError extends BaseError {
  constructor(message = "Too many requests", options?: ErrorOptions) {
    super(message, options);
    this.name = "TooManyRequestsError";
    this.cause = this.cause ?? "tooManyRequests";
    this.code = 429;
  }
}

export class InternalError extends BaseError {
  constructor(message = "Internal Error", options?: ErrorOptions) {
    super(message, options);
    this.name = "InternalError";
    this.cause = this.cause ?? "internal";
    this.code = 500;
  }
}

type ErrorJson = {
  error: string;
  cause: string;
  message: string;
  issues?: { category: string; message: string; entityName?: string; entityType?: string; requirementTree?: string }[];
};

export function toJson(error: Error): [ErrorJson, Code] {
  const baseError = error instanceof BaseError ? error : BaseError.fromError(error);

  const isDev = process.env.NODE_ENV === "development";

  if (baseError.code === 500) {
    console.error(`[api] ${isDev ? error.stack || error.message : error.message}`);
    Sentry.captureException(error);
  }

  const errorJson: ErrorJson = isDev || baseError.code !== 500
    ? { error: baseError.name, cause: (baseError.cause || "") as string, message: baseError.message }
    : { error: "InternalError", cause: "internal", message: "Internal Server Error" };

  if ("issues" in baseError && Array.isArray(baseError.issues)) {
    errorJson.issues = baseError.issues;
  }

  return [errorJson, baseError.code];
}
