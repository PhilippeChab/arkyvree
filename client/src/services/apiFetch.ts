import type { ErrorJson } from "@/server/errors/index.ts";

import { ApiError } from "./ApiError.ts";

/** The API's fetch: the session's cookie goes along, and any answer but a 2xx throws its error as an `ApiError`. */
export async function apiFetch(input: URL | RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
  });

  if (!response.ok) {
    // Errors from the API are JSON, but a proxy in front of it (502, 413, …) can answer with HTML. Its error then says
    // nothing of its own, so `errorMessage`'s fallback says what failed ("Failed to save item"), never a JSON parse
    // error or a message that names nothing.
    const errorData: Partial<ErrorJson> = await response.json().catch(() => ({}));

    throw new ApiError(errorData.message ?? "", response.status, errorData.error || "UnknownError", errorData.issues);
  }

  return response;
}
