import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';

export type AuditAction = 
  | 'api_key_created' 
  | 'api_key_rotated' 
  | 'api_key_deactivated' 
  | 'webhook_created' 
  | 'webhook_rotated' 
  | 'webhook_deactivated' 
  | 'webhook_retried';

export type ResourceType = 'api_key' | 'webhook';

@Injectable()
export class AuditService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async log(
    merchantId: string,
    action: AuditAction,
    resourceType: ResourceType,
    resourceId: string,
    options?: {
      actorIp?: string;
      actorEmail?: string;
      metadata?: Record<string, any>;
    },
  ) {
    await this.pool.query(
      `INSERT INTO audit_logs (merchant_id, action, resource_type, resource_id, actor_ip, actor_email, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        merchantId,
        action,
        resourceType,
        resourceId,
        options?.actorIp ?? null,
        options?.actorEmail ?? null,
        options?.metadata ? JSON.stringify(options.metadata) : null,
      ],
    );
  }

  async list(merchantId: string, limit: number = 100, offset: number = 0) {
    const result = await this.pool.query(
      `SELECT * FROM audit_logs 
       WHERE merchant_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [merchantId, limit, offset],
    );
    return result.rows;
  }
}
