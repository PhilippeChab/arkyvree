import { ApiError } from "@/client/src/services/apiError.ts";
import type { ErrorJson } from "@/server/errors/index.ts";

/** The API's fetch: the session's cookie goes along, and any answer but a 2xx throws its error as an `ApiError`. */
export async function apiFetch(input: URL | RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
  });

  if (!response.ok) {
    // Errors from the API are JSON, but a proxy in front of it (502, 413, …)
    // can answer with HTML. Fall back to a generic message instead of
    // surfacing a JSON parse error.
    const errorData: Partial<ErrorJson> = await response.json().catch(() => ({}));

    throw new ApiError(
      errorData.message || "An unexpected error occurred",
      response.status,
      errorData.error || "UnknownError",
      errorData.issues,
    );
  }

  return response;
}
