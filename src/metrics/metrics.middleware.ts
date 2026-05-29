import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { MetricsService } from './metrics.service';

@Injectable()
export class MetricsMiddleware implements NestMiddleware {
  constructor(private readonly metrics: MetricsService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const start = process.hrtime.bigint();

    // Prefer route pattern if available, otherwise normalize a bit.
    const route = (req.route && (req.route as any).path) ? String((req.route as any).path) : req.path || 'unknown';
    const method = req.method || 'GET';

    this.metrics.onRequestStart(route, method);

    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const durationMs = Number(end - start) / 1_000_000;
      this.metrics.onRequestEnd(route, method, res.statusCode, durationMs);
    });

    next();
  }
}

