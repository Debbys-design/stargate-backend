import { Injectable, Logger } from '@nestjs/common';
import {
  collectDefaultMetrics,
  Counter,
  Gauge,
  Histogram,
  register,
  type HistogramConfiguration,
} from 'prom-client';
import type { IncomingMessage } from 'http';

export type QueueConsumerStatus = 'success' | 'error' | 'skipped';


@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  private readonly httpRequestsTotal: Counter<string>;
  private readonly httpRequestDurationSeconds: Histogram<string>;
  private readonly httpInflightRequests: Gauge<string>;

  private readonly queueConsumerProcessedTotal: Counter<string>;
  private readonly queueConsumerProcessingDurationSeconds: Histogram<string>;
  private readonly queueConsumerDepth: Gauge<string>;

  constructor() {
    // Avoid re-registering on hot reload
    try {
      collectDefaultMetrics({ register });
    } catch (e) {
      // ignore
    }

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['route', 'method', 'status'] as const,
      registers: [register],
    });

    this.httpRequestDurationSeconds = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['route', 'method', 'status'] as const,
      // RED: E as histogram
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [register],
    } satisfies HistogramConfiguration<string>);

    this.httpInflightRequests = new Gauge({
      name: 'http_inflight_requests',
      help: 'Number of in-flight HTTP requests',
      labelNames: ['route', 'method'] as const,
      registers: [register],
    });

    this.queueConsumerProcessedTotal = new Counter({
      name: 'queue_consumer_processed_total',
      help: 'Total items processed by queue consumers',
      labelNames: ['queue', 'consumer', 'status'] as const,
      registers: [register],
    });

    this.queueConsumerProcessingDurationSeconds = new Histogram({
      name: 'queue_consumer_processing_duration_seconds',
      help: 'Time spent processing items by queue consumers',
      labelNames: ['queue', 'consumer', 'status'] as const,
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [register],
    } satisfies HistogramConfiguration<string>);

    this.queueConsumerDepth = new Gauge({
      name: 'queue_consumer_depth',
      help: 'Current backlog/queue depth for queue consumers',
      labelNames: ['queue', 'consumer'] as const,
      registers: [register],
    });
  }

  getRegister() {
    return register;
  }

  async metrics(): Promise<string> {
    return register.metrics();
  }

  onRequestStart(route: string, method: string) {
    this.httpInflightRequests.labels(route, method).inc();
  }

  onRequestEnd(route: string, method: string, status: number, durationMs: number) {
    this.httpInflightRequests.labels(route, method).dec();
    const statusStr = String(status);
    this.httpRequestsTotal.labels(route, method, statusStr).inc();
    this.httpRequestDurationSeconds.labels(route, method, statusStr).observe(durationMs / 1000);
  }

  setQueueDepth(queue: string, consumer: string, depth: number) {
    this.queueConsumerDepth.labels(queue, consumer).set(depth);
  }

  observeQueueItem(queue: string, consumer: string, status: QueueConsumerStatus, durationMs: number) {
    this.queueConsumerProcessedTotal.labels(queue, consumer, status).inc();
    this.queueConsumerProcessingDurationSeconds
      .labels(queue, consumer, status)
      .observe(durationMs / 1000);
  }

  // Convenience for middleware compatibility
  inferRoute(req: IncomingMessage, fallbackRoute: string) {
    return (req.url && typeof req.url === 'string') ? fallbackRoute : fallbackRoute;
  }
}

