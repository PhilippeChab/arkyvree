import { initOtel } from "@/server/otel.ts";
import { initSentry } from "@/server/sentry.ts";

initSentry("web");
initOtel("web");
