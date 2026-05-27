import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';

export interface AuditLogEntry {
  merchantId: string | null;
  actor: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

@Injectable()
export class AuditLogsService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async log(entry: AuditLogEntry): Promise<void> {
    await this.pool.query(
      `INSERT INTO audit_logs (merchant_id, actor, action, resource_type, resource_id, metadata, ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        entry.merchantId ?? null,
        entry.actor,
        entry.action,
        entry.resourceType,
        entry.resourceId ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.ipAddress ?? null,
      ],
    );
  }

  async list(
    merchantId: string,
    query: { actor?: string; action?: string; resource_type?: string; page?: string; limit?: string },
  ) {
    const page = Math.max(Number(query.page ?? 1), 1);
    const limit = Math.min(Math.max(Number(query.limit ?? 20), 1), 100);
    const offset = (page - 1) * limit;

    const conditions: string[] = ['merchant_id=$1'];
    const params: unknown[] = [merchantId];

    if (query.actor) {
      params.push(query.actor);
      conditions.push(`actor=$${params.length}`);
    }
    if (query.action) {
      params.push(query.action);
      conditions.push(`action=$${params.length}`);
    }
    if (query.resource_type) {
      params.push(query.resource_type);
      conditions.push(`resource_type=$${params.length}`);
    }

    const where = conditions.join(' AND ');
    params.push(limit, offset);

    const result = await this.pool.query(
      `SELECT id, actor, action, resource_type, resource_id, metadata, ip_address, created_at,
              COUNT(*) OVER() AS total
         FROM audit_logs
        WHERE ${where}
        ORDER BY created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      page,
      limit,
      total: Number(result.rows[0]?.total ?? 0),
      items: result.rows.map(({ total: _total, ...row }) => row),
    };
  }
}
