import ErrorReporting from "@/server/ErrorReporting.ts";
import Telemetry from "@/server/Telemetry.ts";

ErrorReporting.init("worker");
Telemetry.init("worker");
