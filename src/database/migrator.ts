import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';

export async function runMigrations(pool: Pool, migrationsDir = join(process.cwd(), 'db', 'migrations')) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const files = (await fs.readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const already = await pool.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [file]);
    if (already.rowCount) continue;
    const sql = await fs.readFile(join(migrationsDir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
