import Telemetry from "@/server/otel.ts";
import ErrorReporting from "@/server/sentry.ts";

ErrorReporting.init("web");
Telemetry.init("web");
