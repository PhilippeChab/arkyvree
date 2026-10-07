import { metrics } from "@opentelemetry/api";
import { logs } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { HostMetrics } from "@opentelemetry/host-metrics";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";

import { getEnvironmentName, readEnv } from "./environment.ts";

/** OpenTelemetry's metrics and logs, pushed to Better Stack: its providers, kept to drain them on shutdown. */
class Telemetry {
  private initialized = false;

  private meterProvider: MeterProvider | null = null;

  private loggerProvider: LoggerProvider | null = null;

  private hostMetrics: HostMetrics | null = null;

  /**
   * Initializes OTLP metrics + logs push to Better Stack via OTEL_EXPORTER_OTLP_ENDPOINT and OTEL_AUTH_TOKEN. No-op if
   * either unset.
   *
   * Traces deliberately omitted: Bun's runtime currently doesn't reliably export spans (oven-sh/bun#3775,
   * oven-sh/bun#26536). @hono/otel still runs with disableTracing=true so its HTTP request-duration histogram + active
   * requests counter are recorded — we just skip span creation.
   */
  init(component: "web" | "worker") {
    if (this.initialized) return;
    const token = readEnv("OTEL_AUTH_TOKEN");
    if (!readEnv("OTEL_EXPORTER_OTLP_ENDPOINT") || !token) return;

    const headers = { Authorization: `Bearer ${token}` };
    const resource = resourceFromAttributes({
      [ATTR_SERVICE_NAME]: `arkyvree-${component}`,
      [ATTR_SERVICE_VERSION]: readEnv("FLY_MACHINE_VERSION") || "dev",
      "deployment.environment": getEnvironmentName(),
    });

    this.meterProvider = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({ headers }),
          exportIntervalMillis: 60_000,
        }),
      ],
    });
    metrics.setGlobalMeterProvider(this.meterProvider);

    this.hostMetrics = new HostMetrics({
      name: `arkyvree-${component}-host`,
      meterProvider: this.meterProvider,
    });
    this.hostMetrics.start();

    this.loggerProvider = new LoggerProvider({
      resource,
      processors: [new BatchLogRecordProcessor({ exporter: new OTLPLogExporter({ headers }) })],
    });
    logs.setGlobalLoggerProvider(this.loggerProvider);

    this.initialized = true;
  }

  /** Drains in-flight metric/log batches before process exit. */
  async stop(): Promise<void> {
    await Promise.allSettled([this.meterProvider?.shutdown(), this.loggerProvider?.shutdown()]);
  }
}

export default new Telemetry();
