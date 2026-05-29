import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { getCorrelationId } from './correlation.context';

type LogLevel = 'log' | 'error' | 'warn' | 'debug' | 'verbose';

@Injectable()
export class AppLogger implements NestLoggerService {
  private write(level: LogLevel, message: unknown, context?: string, trace?: string) {
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    const correlationId = getCorrelationId();
    if (correlationId) entry.correlationId = correlationId;
    if (trace) entry.trace = trace;

    process.stdout.write(JSON.stringify(entry) + '\n');
  }

  log(message: unknown, context?: string) {
    this.write('log', message, context);
  }

  error(message: unknown, trace?: string, context?: string) {
    this.write('error', message, context, trace);
  }

  warn(message: unknown, context?: string) {
    this.write('warn', message, context);
  }

  debug(message: unknown, context?: string) {
    this.write('debug', message, context);
  }

  verbose(message: unknown, context?: string) {
    this.write('verbose', message, context);
  }
}
