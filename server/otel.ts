import { logs } from "@opentelemetry/api-logs";
import { metrics } from "@opentelemetry/api";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { HostMetrics } from "@opentelemetry/host-metrics";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchLogRecordProcessor,
  LoggerProvider,
} from "@opentelemetry/sdk-logs";
import {
  MeterProvider,
  PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";

let initialized = false;
let meterProvider: MeterProvider | null = null;
let loggerProvider: LoggerProvider | null = null;
let hostMetrics: HostMetrics | null = null;

// Initializes OTLP metrics + logs push to Better Stack via
// OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_AUTH_TOKEN. No-op if either unset.
//
// Traces deliberately omitted: Bun's runtime currently doesn't reliably
// export spans (oven-sh/bun#3775, oven-sh/bun#26536). @hono/otel still runs
// with disableTracing=true so its HTTP request-duration histogram + active
// requests counter are recorded — we just skip span creation.
export function initOtel(component: "web" | "worker") {
  if (initialized) return;
  const token = process.env.OTEL_AUTH_TOKEN;
  if (!process.env.OTEL_EXPORTER_OTLP_ENDPOINT || !token) return;

  const headers = { Authorization: `Bearer ${token}` };
  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: `arkyvree-${component}`,
    [ATTR_SERVICE_VERSION]: process.env.FLY_MACHINE_VERSION || "dev",
    "deployment.environment": process.env.NODE_ENV || "development",
  });

  meterProvider = new MeterProvider({
    resource,
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter({ headers }),
        exportIntervalMillis: 60_000,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);

  hostMetrics = new HostMetrics({
    name: `arkyvree-${component}-host`,
    meterProvider,
  });
  hostMetrics.start();

  loggerProvider = new LoggerProvider({
    resource,
    processors: [
      new BatchLogRecordProcessor(new OTLPLogExporter({ headers })),
    ],
  });
  logs.setGlobalLoggerProvider(loggerProvider);

  initialized = true;
}

// Drains in-flight metric/log batches before process exit.
export async function shutdownOtel(): Promise<void> {
  await Promise.allSettled([
    meterProvider?.shutdown(),
    loggerProvider?.shutdown(),
  ]);
}
