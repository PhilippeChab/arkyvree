/**
 * The public API's OpenAPI document, built from its routes: each route's description (`describeRoute`) and the schemas
 * its validation checks (`validate`), so the document is what the routes check and answer.
 */

import { z } from "zod";

import type { RouteDescription, Validation } from "@/server/middlewares/index.ts";

import { v1Error } from "./schemas/references.ts";

/** A route's operation in the document. */
interface Operation {
  description: string;
  operationId: string;
  parameters: { description?: string; in: "path" | "query"; name: string; required: boolean; schema: JsonSchema }[];
  requestBody?: { content: Record<string, { schema: JsonSchema }>; required: true };
  responses: Record<string, unknown>;
  summary: string;
  tags: string[];
}

/** What a route's handlers carry: its description, and what each validation checks. */
interface RouteParts {
  description?: RouteDescription;
  validations: Validation[];
}

/** A router, as Hono lists its routes: each handler, by method and path. */
interface Router {
  routes: { handler: object; method: string; path: string }[];
}

/** A JSON Schema, as zod writes it. */
type JsonSchema = Record<string, unknown>;

/** The media types a body is sent as, by its validation's target. */
const BODY_TYPES = { form: "multipart/form-data", json: "application/json" } as const;

/** The answers every route may give besides its own, each the error envelope. */
const ERROR_RESPONSES = {
  "401": { $ref: "#/components/responses/Unauthorized" },
  "429": { $ref: "#/components/responses/TooManyRequests" },
  default: { $ref: "#/components/responses/Error" },
};

/** Where a validation's input is in the request, as the document names it. */
const PARAMETER_PLACES = { param: "path", query: "query" } as const;

/** How a request signs in: its key's token, as a bearer. */
const SECURITY_SCHEMES = {
  apiKey: {
    bearerFormat: "ark_…",
    description: "An API key, made on the app's Settings page: `Authorization: Bearer <key>`",
    scheme: "bearer",
    type: "http",
  },
};

/** A router's routes, each its handlers' description and validations, by path and method. */
function collectRoutes(router: Router) {
  const routes = new Map<string, Map<string, RouteParts>>();
  for (const { handler, method, path } of router.routes) {
    if (method === "ALL") continue;
    const methods = routes.get(path) ?? new Map<string, RouteParts>();
    routes.set(path, methods);
    const parts = methods.get(method.toLowerCase()) ?? { validations: [] };
    methods.set(method.toLowerCase(), parts);
    if ("description" in handler) parts.description = handler.description as RouteDescription;
    if ("validation" in handler) parts.validations.push(handler.validation as Validation);
  }
  return routes;
}

/**
 * A schema the document names, its references moved from zod's `$defs` to the document's components, each name ending
 * in `suffix`: a request's are its own (`FeatInput`), since a default or a transform makes what a request may send
 * differ from what an answer holds.
 */
function toComponentRefs(value: unknown, suffix: string): unknown {
  if (Array.isArray(value)) return value.map((entry) => toComponentRefs(entry, suffix));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === "$ref" && typeof entry === "string"
        ? `${entry.replace("#/$defs/", "#/components/schemas/")}${suffix}`
        : toComponentRefs(entry, suffix),
    ]),
  );
}

/** A word of a path, capitalized: `spells-known` is `SpellsKnown`, a parameter `:classId` `ByClassId`. */
function toIdWord(segment: string) {
  const word = segment.replace(/^:/, "").replaceAll(/-(\w)/g, (_, letter: string) => letter.toUpperCase());
  return `${segment.startsWith(":") ? "By" : ""}${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

/**
 * A schema as JSON Schema, what a request sends (`input`) or what a route answers (`output`), the schemas it names
 * gathered in `components`.
 */
function toJsonSchema(schema: z.ZodType, io: "input" | "output", components: Record<string, unknown>) {
  const { $defs = {}, $schema: _dialect, ...json } = z.toJSONSchema(schema, { io, unrepresentable: "any" });
  const suffix = io === "input" ? "Input" : "";
  for (const [name, definition] of Object.entries($defs))
    components[`${name}${suffix}`] = toComponentRefs(definition, suffix);
  return toComponentRefs(json, suffix) as JsonSchema;
}

/** A route's operation: what it does, what it takes and what it answers. */
function toOperation(
  method: string,
  path: string,
  { description, validations }: RouteParts,
  components: Record<string, unknown>,
) {
  if (!description) throw new Error(`The public API's route ${path} has no description (\`describeRoute\`)`);
  const body = validations.find(({ target }) => target === "json" || target === "form");
  const { response, status, summary } = description;
  const operation: Operation = {
    description: summary,
    operationId: toOperationId(method, path),
    parameters: toParameters(validations, components),
    responses: {
      [status]: {
        description: summary,
        ...(response && { content: { "application/json": { schema: toJsonSchema(response, "output", components) } } }),
      },
      ...ERROR_RESPONSES,
    },
    summary,
    tags: [path.split("/")[1] ?? ""],
  };
  if (body) {
    const type = BODY_TYPES[body.target as keyof typeof BODY_TYPES];
    operation.requestBody = {
      content: { [type]: { schema: toJsonSchema(body.schema, "input", components) } },
      required: true,
    };
  }
  return operation;
}

/** A route's operation's id, its method and its path's words: `getRulesetsByIdFeatsByFeatId`. */
function toOperationId(method: string, path: string) {
  return `${method}${path.split("/").filter(Boolean).map(toIdWord).join("")}`;
}

/** The parameters a route's path and query validations check, one per field. */
function toParameters(validations: Validation[], components: Record<string, unknown>) {
  return validations.flatMap(({ schema, target }) => {
    if (target !== "param" && target !== "query") return [];
    const { properties = {}, required = [] } = toJsonSchema(schema, "input", components) as {
      properties?: Record<string, JsonSchema>;
      required?: string[];
    };
    return Object.entries(properties).map(([name, { description, ...property }]) => ({
      ...(typeof description === "string" && { description }),
      in: PARAMETER_PLACES[target],
      name,
      required: target === "param" || required.includes(name),
      schema: property,
    }));
  });
}

/** The OpenAPI document of the routes of `router`, mounted at `prefix`. */
export function buildOpenApiDocument(router: Router, prefix: string) {
  const components: Record<string, unknown> = {};
  const paths = Object.fromEntries(
    [...collectRoutes(router)].map(([path, methods]) => [
      `${prefix}${path.replaceAll(/:(\w+)/g, "{$1}")}`,
      Object.fromEntries([...methods].map(([method, parts]) => [method, toOperation(method, path, parts, components)])),
    ]),
  );
  const error = { content: { "application/json": { schema: toJsonSchema(v1Error, "output", components) } } };
  return {
    components: {
      responses: {
        Error: { ...error, description: "An error: the request's, a record it can't reach, a refusal of the rules" },
        TooManyRequests: { ...error, description: "Too many requests: the key's, or its user's" },
        Unauthorized: { ...error, description: "No API key, or one that's revoked or expired" },
      },
      schemas: components,
      securitySchemes: SECURITY_SCHEMES,
    },
    info: {
      description:
        "What the app does, for a caller outside it, signed in with an API key that acts as its user. A page of a " +
        "list answers `{ items, page, nextPage }`, `nextPage` null on the last.",
      title: "Arkyvree",
      version: "1",
    },
    openapi: "3.1.0",
    paths,
    security: [{ apiKey: [] }],
    // The paths are the server's own, under `/v1`: its origin answers them
    servers: [{ description: "This server", url: "/" }],
  };
}
