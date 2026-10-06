import Telemetry from "@/server/otel.ts";
import ErrorReporting from "@/server/sentry.ts";

ErrorReporting.init("worker");
Telemetry.init("worker");
