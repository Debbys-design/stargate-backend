import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { correlationStorage } from './correlation.context';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const correlationId =
      (req.headers[CORRELATION_ID_HEADER] as string | undefined) ?? randomUUID();

    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    correlationStorage.run({ correlationId }, () => next());
  }
}
