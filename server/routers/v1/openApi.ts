import { Hono } from "hono";

import v1Router from "./index.ts";
import { buildOpenApiDocument } from "./openApiDocument.ts";

/** The public API's document, built as the server starts: a route it can't describe stops it. */
const openApiDocument = buildOpenApiDocument(v1Router, "/v1");

/** The public API's OpenAPI document, which a caller reads without a key. */
export default new Hono().get("/", (c) => c.json(openApiDocument, 200));
